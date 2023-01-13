# App Backend #



## Prerequisites ##



1. Download latest stable [NodeJs](https://nodejs.org/it/)
2. Verify npm:
```bash
npm -version
```
3. Set up an [Infura node](https://infura.io/) to connect on the testnet/mainnet network you want to use.
4. If you want to use your own Blockchain node, see **./contract** section. 


## Start-Up ##



1. Download all dependencies (on repository root folder):
```bash
npm install
```
2. Start Backend:
```bash
nodemon
```




## Configuration ##



Set up the Blockchain networks in the **.env-cmdrc.json** file. Foreach network, you have to provide the following fields:
1. **PRIVATE_KEY**: the private key of the wallet that your backend is going to use in this network. You will need some ETH to make your backend working properly.
2. **NETWORK**: the **Infura** node of the network
3. **CURRENT_NETWORK**: the name of the current network

Following an example of the **ropsten** network:
```bash
    "ropsten": {
        "PRIVATE_KEY": "0123...",
        "NETWORK": "https://ropsten.infura.io/v3/......",
        "CURRENT_NETWORK": "ropsten"
    }
```


## Run ##


To run using your own Blockchain **hardhat** node:
```bash
npm run dev:local
```
To run using the **ropsten** testnet network:
```bash
npm run dev:ropsten
```