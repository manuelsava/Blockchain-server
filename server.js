const express = require("express");
var path = require("path");
var createError = require("http-errors");
var cookieParser = require('cookie-parser');
var fs = require("fs");
var ethers = require("ethers");
var mongoose = require('mongoose');
var bodyParser = require('body-parser')
const schedule = require('node-schedule');
var cors = require("cors");

const port = process.env.PORT || 3000

const app = express();
app.use(cors());

var http = require('http').createServer(app);

const io = require("socket.io")(http, { cors: { origin: "*" }});

require('dotenv').config();

const baseABIPath = "./ABIs/"
const net = process.env.NETWORK;
const pk = process.env.PRIVATE_KEY;
const currentNetwork = process.env.CURRENT_NETWORK;
const mongoToken = process.env.MONGODB_TOKEN;

const provider = new ethers.providers.JsonRpcProvider(net);
const wallet = new ethers.Wallet(pk, provider);
const signer = provider.getSigner(wallet.address);

var jsonParser = bodyParser.json()
var urlencodedParser = bodyParser.urlencoded({ extended: false })

mongoose.Promise = global.Promise;
try {
    mongoose.connect(mongoToken, {useNewUrlParser: true, useUnifiedTopology: true});
    mongoose.connection.once('open', () => console.log('Connected')).on('error', (error) => {
        console.log("\n\nERRORE\n\n" + error);
    });
} catch (error) {
    console.log("DB error: " + error);
}

var db = mongoose.connection;
app.set('DB', db);

var Schema = mongoose.Schema;

var SmartContractsSchema = new Schema({
    name: String,
    address: String,
    ABI: String,
    ropsten: String,
}, {collection: 'SmartContracts'});

var BookNFTSchema = new Schema({
    BlockchainID: String,
    university: String,
    name: String,
    authors: String,
    pages: String,
    supply: String,
    description: String,
    metadata: String,
    borrows : [{
        student: String,
        expiration: Date,
        isExpired: Boolean
    }]
}, {collection: 'BookNFT'});

var IdNFTSchema = new Schema({
    BlockchainID: String,
    student: String,
    name: String,
    surname: String,
    university: String,
    metadata: String,
    CFU: Number,
    canGraduate: Boolean,
    graduated: Boolean,
    Degree: {
        DegreeID: String,
        metadata: String
    }
}, {collection: 'IdNFT'});

var UniversitiesSchema = new Schema({
    name: String,
    signature: String,
    address: String,
    cfuToGraduate: Number
}, {collection: 'Universities'});

var ProposalsSchema = new Schema({
    BlockchainID: String,
    university: String,
    proposer: String,
    title: String,
    description: String,
    active: Boolean,
    approved: Boolean,
    yes: Number,
    no: Number,
    noWithVeto: Number,
    voters: [{
        student: String,
        vote: String
    }]
}, {collection: 'Proposals'});

var EnrollmentRequestsSchema = new Schema({
    name: String,
    surname: String,
    university: String,
    wallet: String
}, {collection: 'EnrollmentRequests'});

var EnrollmentsSchema = new Schema({
    student: String,
    university: String,
    tokeinId: String,
}, {collection: 'Enrollments'});

var ExamsSchema = new Schema({
    BlockchainID: String,
    name: String,
    cfu: String,
    university: String,
    active: Boolean,
    enrollments: [{
        student: String
    }],
    verbalizations: [{
        student: String,
        mark: String,
        accepted: Boolean,
        refused: Boolean
    }]
}, {collection: 'Exams'});

var RepetitionsSchema = new Schema({
    student: String,
    name: String,
    subjects: [{
        name: String,
        price: String,
        active: Boolean
    }]
}, {collection: 'Repetitions'});

var SmartContracts = mongoose.model('SmartContracts', SmartContractsSchema);
var BookNFT = mongoose.model('BookNFT', BookNFTSchema);
var IdNFT = mongoose.model('IdNFT', IdNFTSchema);
var Universities = mongoose.model('Universities', UniversitiesSchema);
var Proposals = mongoose.model('Proposals', ProposalsSchema);
var Enrollments = mongoose.model('Enrollments', EnrollmentsSchema);
var EnrollmentRequests = mongoose.model('EnrollmentRequests', EnrollmentRequestsSchema);
var Exams = mongoose.model('Exams', ExamsSchema);
var Repetitions = mongoose.model('Repetitions', RepetitionsSchema);

var uniContract;
var stdContract;
var bookContract;
var enrollContract;
var idContract;
var libraryContract;
var examsContract;
var verbalizationsContract;
var proposalsContract;
var degreeContract;
var degreeNFTcontract;

app.set("SmartContracts", SmartContracts);
app.set("BookNFT", BookNFT);
app.set("IdNFT", IdNFT);
app.set("Universities", Universities);
app.set("Proposals", Proposals);
app.set("EnrollmentRequests", EnrollmentRequests);
app.set("Enrollments", Enrollments);
app.set("Exams", Exams);
app.set("Repetitions", Repetitions);

var addressRooms = {};

io.sockets.on("connection", socket => {
    var signer;
    socket.on("new-listener", (signerAddress) => {
        signer = signerAddress;
        if(addressRooms[signer] === undefined) {    //first in room
            addressRooms[signer] = socket.id;
        } else {
            socket.join(addressRooms[signer]);
        }
    });

    socket.on("disconnect", () => {
    })
})

app.get("/api", (req, res) => {
    res.json({"status": "ok"});
});

async function initContracts() {
    SmartContracts.find().then(function(contracts) {
        for(var index in contracts){
            const element = contracts[index];
            let addr;
            const ABI = require(baseABIPath + element.ABI);
            if(currentNetwork.localeCompare("ropsten") === 0) {
                addr = element.ropsten;
            } else {
                addr = element.address;
            }
            const contract = new ethers.Contract(addr, ABI, signer);            
            
            switch(element.name){
                case "UniToken":
                    uniContract = contract;
                    claimUNI();
                    break;
                case "StudentToken":
                    stdContract = contract;
                    break;
                case "BookNFT":
                    bookContract = contract;
                    break;
                case "EnrollmentContract":
                    enrollContract = contract;
                    break;
                case "IdNFT":
                    idContract = contract;
                    break;
                case "Library":
                    libraryContract = contract;
                    break;
                case "Exams":
                    examsContract = contract;
                    break;
                case "Verbalizations":
                    verbalizationsContract = contract;
                    break;
                case "Proposals":
                    proposalsContract = contract;
                    //whitelistProposer("0x844b9aEF64400c1e0B4302CbCE8928A86De76591");
                    break;
                case "DegreeContract":
                    degreeContract = contract;
                    break;
                case "DegreeNFT":
                    degreeNFTcontract = contract;
                    break;
            } 
        }
    });
    console.log("Contract initialized");
}

async function claimUNI() {    
    console.log("My wallet: " + wallet.address);
    const value = await uniContract.balanceOf(wallet.address);
    console.log("UNI check");
    if(value == 0) {
        const rawTx = await uniContract.populateTransaction.claimToken({value: ethers.utils.parseEther("0.001")});
        const tx = wallet.sendTransaction(rawTx);
        console.log("Uni claimed");
    }
}

initContracts();

app.post("/getContract", jsonParser, (req, res) => {
    const contract = req.body.payload;
    SmartContracts.findOne({name: contract}, {_id:0}).then(function(data) {
        const ABIpath = baseABIPath + data.ABI;

        let rawdata = fs.readFileSync(ABIpath);
        const jsonABI = JSON.parse(rawdata);
        
        res.send({ABI: jsonABI, address: data.address});
    })
});

app.post("/getContracts", jsonParser, (req, res) => {
    SmartContracts.find().then(function(data) {
        var json = [];
        data.forEach(contract => {
            var currentJson = {};
            const ABIpath = baseABIPath + contract.ABI;

            let rawdata = fs.readFileSync(ABIpath);
            const jsonABI = JSON.parse(rawdata);

            let contractAddress = "";

            if(currentNetwork.localeCompare("ropsten") === 0) {
                contractAddress = contract.ropsten;
            } else {
                contractAddress = contract.address;
            }

            const contractName = contract.name;

            currentJson = {contractName, contractAddress, jsonABI};

            json.push(currentJson);
        });
        res.json({Contracts: json});
    }); 
});

app.post("/uploadNFT", jsonParser, (req, res) => {
    const nft = req.body.payload;

    const newNFT = {
        BlockchainID: nft.BlockchainID,
        university: nft.university,
        name: nft.name,
        authors: nft.authors,
        pages: nft.pages,
        description: nft.description,
        supply: nft.supply,
        metadata: nft.metadata
    }

    var data = new BookNFT(newNFT);
    data.save(function(error){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

app.post("/uploadIdNFT", jsonParser, (req, res) => {
    const nft = req.body.payload;

    const newNFT = {
        BlockchainID: nft.BlockchainID,
        student: nft.student,
        name: nft.name,
        surname: nft.surname,
        university: nft.university,
        metadata: nft.metadata,
        CFU: 0,
        canGraduate: false,
        graduated: false
    }

    var data = new IdNFT(newNFT);
    data.save(function(error){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            io.to(addressRooms[nft.student]).emit("student-approved");
            res.json({status: 200});
        }
    });
})

app.post("/getBooks", jsonParser, (req, res) => {
    const uni = req.body.payload;

    BookNFT.find({university: uni.university}).then(function(data){
        res.json({NFTs: data});
    })
});

app.post("/uploadBorrow", jsonParser, (req, res) => {
    const borrow = req.body.payload;
    const expiration = new Date(Date.now() + 60000); //1 minute

    const data = BookNFT.findOneAndUpdate({BlockchainID: borrow.BlockchainID}, {
        $push: {
            borrows: {
                student: borrow.student,
                isExpired: false
            }
        }},
        {
            new: true
        }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            var exp = schedule.scheduleJob("*/10 * * * *", function() {
                const expQuery = BookNFT.updateOne({BlockchainID: borrow.BlockchainID, "borrows.student": borrow.student}, {
                    $set: {
                        "borrows.$.isExpired": true
                    }
                }, function(error, docs){
                    if(error){
                        console.log(error);
                    }else{
                        console.log("Book Expired");
                        io.to(addressRooms[borrow.student]).emit("book-expired");
                    }
                });

                exp.cancel();
            });
            res.json({status: 200});
        }
    });
})

app.post("/uploadReturn", jsonParser, (req, res) => {
    const exam = req.body.payload;

    const data = BookNFT.findOneAndUpdate({BlockchainID: exam.BlockchainID}, {
        $pull: {
            borrows: {
                student: exam.student
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

app.post("/getUnis", jsonParser, (req, res) => {
    Universities.find().then(function(data){
        res.json({Unis: data});
    })
});

app.post("/registerUniversity", jsonParser, (req, res) => {
    const university = req.body.payload;

    const newUni = {
        name: university.name,
        signature: university.signature,
        address: university.address,
        cfuToGraduate: 0
    }

    var data = new Universities(newUni);
    data.save(function(error){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
});

app.post("/enrollRequest", jsonParser, (req, res) => {
    const student = req.body.payload;

    const newStudent = {
        university: student.university,
        name: student.name,
        surname: student.surname,
        wallet: student.wallet
    }

    var data = new EnrollmentRequests(newStudent);
    data.save(function(error){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            io.to(addressRooms[student.university]).emit("enrollment-received");
            res.json({status: 200});
        }
    });
});

app.post("/getPendingRequests", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.enrollmentRequest;

    try {
        if(reqObj.type === "equal"){
            EnrollmentRequests.find({university: reqObj.value}).then(function (data) {
                res.json({requests: data});
            });
        }
    } catch (err) {
        res.json({requests: null});
    }

})

app.post("/sendRepNotification", jsonParser, (req, res) => {
    const notification = req.body.payload;

    io.to(addressRooms[notification.to]).emit("paymentReceived");
})

app.post("/deleteRequest", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.enrollmentRequest;

    var ObjectId = require("mongodb").ObjectId;
    const oId = new ObjectId(reqObj.value.toString());

    try {
        if(reqObj.type === "equal"){
            EnrollmentRequests.findOneAndDelete({_id: oId}, function(err) {
                if(err){
                    res.json({status: 500}); 
                }else{
                    res.json({status: 200});
                }
            })
        }
    } catch (err) {
        res.json({requests: null});
    }
});

app.post("/getStudentInfo", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.student;

    try {
        if(reqObj.type === "equal"){
            IdNFT.find({student: reqObj.value}).then(function (data) {
                res.json({info: data});
            });
        }
    } catch (err) {
        res.json({info: null});
    }
})

app.post("/getUniversityInfo", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.university;

    try {
        if(reqObj.type === "equal"){
            Universities.findOne({address: reqObj.value}).then(function (data) {
                res.json({info: data});
            });
        }
    } catch (err) {
        res.json({info: null});
    }
})

app.post("/uploadExam", jsonParser, (req, res) => {
    const exam = req.body.payload;

    const newExam = {
        BlockchainID: exam.BlockchainID,
        name: exam.name,
        cfu: exam.cfu,
        university: exam.university,
        active: true
    }

    var intCfu = parseInt(exam.cfu);

    var data = new Exams(newExam);
    data.save(function(error){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            Universities.updateOne({address: exam.university}, {
                $inc: {
                    cfuToGraduate: intCfu
                }
            }).then(function (result){
                if(result){
                    res.json({status: 200});
                }
                else {
                    res.json({status: 500});
                }
            })
        }
    });
});

app.post("/loadExamsByUniversity", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.university;

    try {
        if(reqObj.type === "equal"){
            Exams.find({university: reqObj.value}).then(function (data) {
                res.json({exams: data});
            });
        }
    } catch (err) {
        res.json({exams: null});
    }
})

app.post("/loadActiveExamsByUniversity", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.university;

    try {
        if(reqObj.type === "equal"){
            Exams.find({university: reqObj.value, "active": true}).then(function (data) {
                res.json({exams: data});
            });
        }
    } catch (err) {
        res.json({exams: null});
    }
})

app.post("/changeExamStatus", jsonParser, (req, res) => {
    const exam = req.body.payload;

    var myquery = {_id: exam.id};
    var newvalues = { $set: {active: exam.active} };

    Exams.updateOne(myquery, newvalues, function(err, ress) {
        if(err){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
});

app.post("/enrollStudentExam", jsonParser, (req, res) => {
    const exam = req.body.payload;

    const data = Exams.findByIdAndUpdate(exam.examId, {
        $push: {
            enrollments: {
                student: exam.student,
                mark: "-1"
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

app.post("/unenrollStudentExam", jsonParser, (req, res) => {
    const exam = req.body.payload;

    const data = Exams.findByIdAndUpdate(exam.examId, {
        $pull: {
            enrollments: {
                student: exam.student
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

//TODO -> Show only exam not verbalized!
app.post("/getExamById", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.exam;

    try {
        if(reqObj.type === "equal"){
            Exams.findOne({_id: reqObj.value}).then(function (data) {
                res.json({exam: data});
            });
        }
    } catch (err) {
        res.json({exam: null});
    }
})

app.post("/getExamsByStudent", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.student;

    try {
        if(reqObj.type === "equal"){
            Exams.find({"enrollments.student": reqObj.value }).then(function (enrollments) {
                Exams.find({"verbalizations.student": reqObj.value }).then(function (verbalizations) {
                    res.json({enrollments: enrollments, verbalizations: verbalizations});
                });  
            });
        }
    } catch (err) {
        res.json({exam: null});
    }
})

app.post("/uploadVerbalization", jsonParser, (req, res) => {
    const exam = req.body.payload;
    var accepted = false;
    if(exam.mark < 18)
        accepted = true;

    var data = Exams.findByIdAndUpdate(exam.examId, {
        $push: {
            verbalizations: {
                student: exam.student,
                mark: exam.mark,
                accepted: accepted,
                refused: false
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            var data2 = Exams.findByIdAndUpdate(exam.examId, {
                $pull: {
                    enrollments: {
                        _id: exam.enrollmentId
                    }
                }
            }, function(error){
                if(error){
                    console.log(error);
                    res.json({status: 500});
                }else{
                    io.to(addressRooms[exam.student]).emit("vote-received");
                    res.json({status: 200});
                }
            });
        }
    });
})

app.post("/uploadMark", jsonParser, (req, res) => {
    const exam = req.body.payload;
    const cfuInt = parseInt(exam.cfu);

    console.log(exam);

    const query1 = IdNFT.findOne({student:exam.student}).then(function(stud){
        const currCFUs = parseInt(stud.CFU);
        const newCFUs = cfuInt + currCFUs;

        const data = Exams.updateOne({_id: exam.examId, "verbalizations._id": exam.verbID}, {
            $set: {
                "verbalizations.$.accepted": true
            }
        }, function(error, docs){
            if(error){
                console.log(error);
                res.json({status: 500});
            }else{
                Universities.findOne({address: exam.university}).then(function (c) {
                    console.log(c);
                    if(newCFUs >= c.cfuToGraduate) {
                        const query2 = IdNFT.updateOne({student: exam.student}, {
                            $set: {
                                CFU: newCFUs,
                                canGraduate: true
                            },
                        }, function (err, doc) {
                            if(error){
                                console.log(error);
                                res.json({status: 500});
                            }else{
                                res.json({status: 200, canGraduate: true});
                            }
                        })
                    } else {
                        const query2 = IdNFT.updateOne({student: exam.student}, {
                            $set: {
                                CFU: newCFUs,
                            },
                        }, function (err, doc) {
                            if(error){
                                console.log(error);
                                res.json({status: 500});
                            }else{
                                res.json({status: 200, canGraduate: false});
                            }
                        })   
                    }
                })
            }
        });
    })
})

app.post("/refuseMark", jsonParser, (req, res) => {
    const exam = req.body.payload;

    const data = Exams.updateOne({_id: exam.examId, "verbalizations._id": exam.verbID}, {
        $set: {
            "verbalizations.$.refused": true
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

app.post("/getRepetitions", jsonParser, (req, res) => {
    Repetitions.find({"subjects.active" : true}).then(function (data) {
        res.json({reps: data});
    });
})

app.post("/getRepetitionsByStudent", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.student;

    try {
        if(reqObj.type === "equal"){
            Repetitions.findOne({student: reqObj.value}).then(function (data) {
                res.json({reps: data});
            });
        }
    } catch (err) {
        console.log(err);
        res.json({reps: null});
    }
})

app.post("/deleteSubjectById", jsonParser, (req, res) => {
    const subject = req.body.payload;

    const data = Repetitions.findOneAndUpdate({student: subject.student}, {
        $pull: {
            subjects: {
                _id: subject.id
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

app.post("/addNewRepetition", jsonParser, (req, res) => {
    const reqObj = req.body.payload;

    const checkIfExists = Repetitions.findOne({student: reqObj.student}).then(function (data) {
        if(data === null){
            const newRep = {
                student: reqObj.student,
                name: reqObj.name,
                subjects: {
                    name: reqObj.subject,
                    price: reqObj.price,
                    active: true
                }
            }
            var query1 = new Repetitions(newRep);
            query1.save(function(error){
                if(error){
                    console.log(error);
                    res.json({status: 500});
                }else{
                    res.json({status: 200});
                }
            });
        } else {
            const data2 = Repetitions.findByIdAndUpdate(data._id, {
                $push: {
                    subjects: {
                        name: reqObj.subject,
                        price: reqObj.price,
                        active: true
                    }
                }
            }, function(error, docs){
                if(error){
                    console.log(error);
                    res.json({status: 500});
                }else{
                    res.json({status: 200});
                }
            });
        }
    })
})

app.post("/changeSubjectStatusById", jsonParser, (req, res) => {
    const subject = req.body.payload;

    const data = Repetitions.updateOne({student: subject.student, "subjects._id": subject.id}, {
        $set: {
            "subjects.$.active": subject.active
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

app.post("/uploadProposal", jsonParser, (req, res) => {
    const proposal = req.body.payload;

    const newProposal = {
        BlockchainID: proposal.BlockchainID,
        university: proposal.university,
        proposer: proposal.proposer,
        title: proposal.title,
        description: proposal.description,
        active: true,
        approved: false,
        yes: 0,
        no: 0,
        noWithVeto: 0,
    }

    var data = new Proposals(newProposal);
    data.save(async function(error){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            io.emit("update-proposals");
            var exp = schedule.scheduleJob("*/60 * * * *", function() { //after 1 hour
                expireProposal(proposal.university, proposal.BlockchainID, proposal.proposer);
                const expQuery = Proposals.updateOne({BlockchainID: proposal.BlockchainID}, {
                    $set: {
                        active: false
                    }
                }, function(error, docs){
                    if(error){
                        console.log(error);
                    }else{
                        console.log("Proposal " + proposal.BlockchainID + " Expired");
                    }
                });

                exp.cancel();
            });
            res.json({status: 200});
        }
    });
})

app.post("/getActiveProposals", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.university;

    try {
        if(reqObj.type === "equal"){
            Proposals.find({university: reqObj.value, active: true}).then(function (data) {
                res.json({proposals: data});
            });
        }
    } catch (err) {
        res.json({proposals: null});
    }
})

app.post("/getApprovedProposals", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.university;

    try {
        if(reqObj.type === "equal"){
            Proposals.find({university: reqObj.value, active: false, approved: true}).then(function (data) {
                res.json({proposals: data});
            });
        }
    } catch (err) {
        res.json({proposals: null});
    }
})

app.post("/updloadVote", jsonParser, (req, res) => {
    const vote = req.body.payload;
    var voteField = vote.vote.localeCompare("no with veto") === 0 ? "noWithVeto" : vote.vote;

    const expQuery = Proposals.updateOne({BlockchainID: vote.BlockchainID}, {
        $inc: {
            [voteField]: 1
        },
        $push: {
            voters: {
                student: vote.student,
                vote: vote.vote
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            uploadTransaction(vote.university, vote.BlockchainID, vote.vote)
            res.json({status: 200});
        }
    });
})

async function uploadTransaction(uni, BlockchainID, vote) {
    BlockchainID = parseInt(BlockchainID);
    var intVote = 0;

    if(vote.localeCompare("no") === 0)
        intVote = 1;
    if(vote.localeCompare("no with veto") === 0)
        intVote = 2;

    const rawTx = await proposalsContract.populateTransaction.voteProposal(uni, BlockchainID, intVote)
    const tx = await wallet.sendTransaction(rawTx).then((result) => {
        console.log("Blockchain vote uploaded");
    }).catch((err) => {
        console.log(err);
    });
}

async function expireProposal(uni, id, student) {
    const intId = parseInt(id);
    const rawTx = await proposalsContract.populateTransaction.expireProposal(uni, intId)
    const tx = await wallet.sendTransaction(rawTx).then((result) => {
        console.log("Blockchain proposal expired");
    }).catch((err) => {
        console.log(err);
    });

    //Calculates votes
    var yes, no, noWithVeto, total;
    Proposals.findOne({BlockchainID: id}).then((result) => {
        const proposal = result;
        yes = proposal.yes;
        no = proposal.no;
        noWithVeto = proposal.noWithVeto;
        total = yes + no + noWithVeto;
        if(yes >= (total / 2 + 1)){
            const expQuery = Proposals.updateOne({BlockchainID: id}, {
                $set: {
                    approved: true
                }
            }, function(error, docs){
                if(error){
                    console.log(error);
                }else{
                    console.log("proposal approved");
                    io.to(addressRooms[student]).emit("proposal-approved");
                    io.to(addressRooms[uni]).emit("proposal-approved");
                }
            });
        }
        else if (noWithVeto >= no){
            blacklistProposer(student);
            io.to(addressRooms[student]).emit("proposal-negateWithVeto");
        }
        else {
            io.to(addressRooms[student]).emit("proposal-negate");
        }
        io.emit("update-proposals");
    })
}

app.post("/getDegreeMark", jsonParser, (req, res) => {
    const reqObj = req.body.navigation.params.path.university;

    var mark = 0;
    var count = 0;
    var credits = 0
    Exams.find({university: reqObj.value, "verbalizations.student": reqObj.student}).then(function(exams) {
        for(var index in exams) {
            for(var j in exams[index].verbalizations) {
                console.log(exams[index].verbalizations[j]);
                if(exams[index].verbalizations[j].student.localeCompare(reqObj.student) === 0){
                    const currMark = parseInt(exams[index].verbalizations[j].mark);
                    const cfu = parseInt(exams[index].cfu);
                    const accepted = exams[index].verbalizations[j].accepted;
                    if(accepted && currMark >= 18){
                        mark += (currMark * cfu);
                        count++;
                        credits+=cfu;
                    }    
                }
            }
        }
        mark = ((mark / credits) * 110) / 30;
        mark = parseInt(mark);
        res.json({mark: mark});
    }) 
})

app.post("/uploadGraduation", jsonParser, (req, res) => {
    const degree = req.body.payload;

    IdNFT.updateOne({student: degree.student}, {
        $set: {
            graduated: true,
            canGraduate: false,
        },
        $push: {
            Degree: {
                DegreeID: degree.tokenId,
                metadata: degree.url
            }
        }
    }, function(error, docs){
        if(error){
            console.log(error);
            res.json({status: 500});
        }else{
            res.json({status: 200});
        }
    });
})

async function blacklistProposer(student) {
    const rawTx = await proposalsContract.populateTransaction.blacklistStudent(student)
    const tx = await wallet.sendTransaction(rawTx).then((result) => {
        console.log("Student blacklisted");
        var exp = schedule.scheduleJob("*/10 * * * *", function() {
            whitelistProposer(student);
            exp.cancel();
        });
    }).catch((err) => {
        console.log(err);
    });
}

async function whitelistProposer(student) {
    const whiteListTx = await proposalsContract.populateTransaction.whitelistStudent(student)
    const tx = await wallet.sendTransaction(whiteListTx).then((result2) => {
        console.log("Student whitelisted");
        io.to(addressRooms[student]).emit("whitelisted");
    }).catch((err) => {
        console.log(err);
    }); 
}

http.listen(port, () => {console.log("Server started on port ", + port)})