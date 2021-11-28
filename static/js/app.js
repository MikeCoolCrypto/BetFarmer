"use strict";

/**
 * Example JavaScript code that interacts with the page and Web3 wallets
 */

 // Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const Fortmatic = window.Fortmatic;
const evmChains = window.evmChains;

// Web3modal instance
let web3Modal

// Chosen wallet provider given by the dialog window
let provider;


// Address of the selected account
let selectedAccount;

var myWeb3;


/**
 * Setup the orchestra
 */
function init() {

  console.log("Initializing example");
  console.log("WalletConnectProvider is", WalletConnectProvider);
  console.log("Fortmatic is", Fortmatic);
  console.log("window.web3 is", window.web3, "window.ethereum is", window.ethereum);

  // Check that the web page is run in a secure context,
  // as otherwise MetaMask won't be available
  if(location.protocol !== 'https:') {
    // https://ethereum.stackexchange.com/a/62217/620
    alert("Cannot use the blockchain without https")
    return;
  }

  // Tell Web3modal what providers we have available.
  // Built-in web browser provider (only one can exist as a time)
  // like MetaMask, Brave or Opera is added automatically by Web3modal
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        // Mikko's test key - don't copy as your mileage may vary
        infuraId: "8043bb2cf99347b1bfadfb233c5325c0",
      }
    },

    fortmatic: {
      package: Fortmatic,
      options: {
        // Mikko's TESTNET api key
        key: "pk_test_391E26A3B43A3350"
      }
    }
  };

  web3Modal = new Web3Modal({
    cacheProvider: false, // optional
    providerOptions, // required
    disableInjectedProvider: false, // optional. For MetaMask / Brave / Opera.
  });

  console.log("Web3Modal instance is", web3Modal);
}


/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
async function fetchAccountData() {

    console.log("fetchAccountData")

  // Get a Web3 instance for the wallet
  const web3 = new Web3(provider);
  myWeb3 = web3;

  console.log("Web3 instance is", web3);

  // Get connected chain id from Ethereum node
  const chainId = await web3.eth.getChainId();
  // Load chain information over an HTTP API
  if (chainId != 31337) { 
    const chainData = evmChains.getChain(chainId);
    document.querySelector("#network-name").textContent = " - Network: " + chainData.name;
  }

  $("#btn-disconnect").show()
  $("#btn-connect").hide()
  $("#notConnectedInvestment").hide()
  

  // Get list of accounts of the connected wallet
  const accounts = await web3.eth.getAccounts();

  // MetaMask does not give you all accounts, only the selected account
  console.log("Got accounts", accounts);
  selectedAccount = accounts[0];

  document.querySelector("#selected-account").textContent = selectedAccount;

  instantiateUSDC();
  instantiateWMATIC();
  instantiateBettingContract();
  retrieveUsdcBalanceOfUser(selectedAccount);
  retrieveBTCPrice();
  retrieveTotalStaked();
  retrieveBetFromUser();
  retrieveUserStaked();

  checkAllowance(selectedAccount) 

  // Get a handl
  const template = document.querySelector("#template-balance");
  const accountContainer = document.querySelector("#accounts");

  // Purge UI elements any previously loaded accounts
  accountContainer.innerHTML = '';

  // Go through all accounts and get their ETH balance
  const rowResolvers = accounts.map(async (address) => {
    const balance = await web3.eth.getBalance(address);
    // ethBalance is a BigNumber instance
    // https://github.com/indutny/bn.js/
    const ethBalance = web3.utils.fromWei(balance, "ether");
    const humanFriendlyBalance = parseFloat(ethBalance).toFixed(4);
    // Fill in the templated row and put in the document
    const clone = template.content.cloneNode(true);
    clone.querySelector(".address").textContent = address;
    clone.querySelector(".balance").textContent = humanFriendlyBalance;
    accountContainer.appendChild(clone);
  });

  // Because rendering account does its own RPC commucation
  // with Ethereum node, we do not want to display any results
  // until data for all accounts is loaded
  await Promise.all(rowResolvers);

  // Display fully loaded UI for wallet data
  document.querySelector("#connected").style.display = "block";
}



/**
 * Fetch account data for UI when
 * - User switches accounts in wallet
 * - User switches networks in wallet
 * - User connects wallet initially
 */
async function refreshAccountData() {

  // If any current data is displayed when
  // the user is switching acounts in the wallet
  // immediate hide this data
  document.querySelector("#connected").style.display = "none";

  // Disable button while UI is loading.
  // fetchAccountData() will take a while as it communicates
  // with Ethereum node via JSON-RPC and loads chain data
  // over an API call.
  document.querySelector("#btn-connect").setAttribute("disabled", "disabled")
  await fetchAccountData(provider);
  document.querySelector("#btn-connect").removeAttribute("disabled")
}


/**
 * Connect wallet button pressed.
 */
async function onConnect() {

  console.log("Opening a dialog", web3Modal);
  try {
    provider = await web3Modal.connect();
  } catch(e) {
    console.log("Could not get a wallet connection", e);
    return;
  }

  // Subscribe to accounts change
  provider.on("accountsChanged", (accounts) => {
      
    fetchAccountData();
  });

  // Subscribe to chainId change
  provider.on("chainChanged", (chainId) => {
    fetchAccountData();
  });

  // Subscribe to networkId change
  provider.on("networkChanged", (networkId) => {
    fetchAccountData();
  });

  await refreshAccountData();
}

/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {

  console.log("Killing the wallet connection", provider);

  // TODO: Which providers have close method?
  if(provider.close) {
    await provider.close();

    // If the cached provider is not cleared,
    // WalletConnect will default to the existing session
    // and does not allow to re-scan the QR code with a new wallet.
    // Depending on your use case you may want or want not his behavir.
    await web3Modal.clearCachedProvider();
    provider = null;
  }

  selectedAccount = null;

  // Set the UI back to the initial state
  document.querySelector("#connected").style.display = "none";

  //$("#btn-disconnect").hide()
  $("#btn-connect").show()
  
}


/**
 * Main entry point.
 */
window.addEventListener('load', async () => {
  init();
  //document.querySelector("#btn-disconnect").addEventListener("click", onDisconnect);
});

function connectWallet() {
    onConnect()

}


var usdcContract;
var WMaticContract;
var mainBettingContract;
var mainBettingContract_address = "0x32a1ECc07cCdb28802EBfb2172779c09a36755c2";


function instantiateUSDC() {
  var usdc_contract_address = "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"; //"0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
  usdcContract = new myWeb3.eth.Contract(usdcABI, usdc_contract_address);
}

function instantiateWMATIC() {
  var matic_contract_address = "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889";
  WMaticContract = new myWeb3.eth.Contract(usdcABI, matic_contract_address);
}



function instantiateBettingContract() {
  mainBettingContract = new myWeb3.eth.Contract(mainBettingABI, mainBettingContract_address);
}

function instantiateBeefy() {
  var usdc_contract_address = "";
  usdcContract = new myWeb3.eth.Contract(usdcABI, usdcContract);
}


function retrieveUsdcBalanceOfUser(address) {
  usdcContract.methods.balanceOf(address).call().then(function(result) {
    console.log("USDC balance is: " + JSON.stringify(result));
    var usdcBalance = 0;
    var balanceRetrieved = parseInt(result);
    if (balanceRetrieved > 0) {
      usdcBalance = balanceRetrieved/10**18
    }
    $("#USDCBalance").text(usdcBalance.toFixed(2))
  });
}


function checkAllowance(address) {
  usdcContract.methods.allowance(address, mainBettingContract_address).call().then(function(result) {
    console.log("Checking allowance is: " + JSON.stringify(result));
    var allowanceRetrieved = parseInt(result);
    if (allowanceRetrieved > 0) {
    $("#approveButton").hide()
    $("#depositButton").show()
    }
  });
}

function approveToken() {
  usdcContract.methods.approve(mainBettingContract_address, myWeb3.utils.toWei('1000000')).send({from:selectedAccount}).on("receipt", (function(result) {
    console.log("Approval is: " + JSON.stringify(result));
     })
    ).on("error", function(error) { console.log(error) })
    $("#approveButton").hide()
    $("#depositButton").show()
}



function approveWMATIC() {
  WMaticContract.methods.approve(mainBettingContract_address, myWeb3.utils.toWei('1000000')).send({from:selectedAccount}).on("receipt", (function(result) {
    console.log("Approval is: " + JSON.stringify(result));
     })
    ).on("error", function(error) { console.log(error) })
    $("#approveButton").hide()
    $("#depositButton").show()
}

function retrieveBTCPrice() {
  mainBettingContract.methods.getLatestPrice().call().then(function(result) {
    console.log("BTC price is: " + JSON.stringify(result));
    var priceRetrieved = parseInt(result);
    priceRetrieved = priceRetrieved / 10**8.
    $("#BTCPrice").text(priceRetrieved + " USD")
  });
}

function retrieveTotalStaked() {
  mainBettingContract.methods.getTotalStaked().call().then(function(result) {
    console.log("Total Stake is: " + JSON.stringify(result));
    var stakeRetrieved = parseInt(result)/10**18 + 1000000 // fake amount if 1M was staked;
    $("#totalValueLocked").text(stakeRetrieved.toFixed(2))
    var possibleReward = stakeRetrieved*0.15/365;
    $("#totalReward").text(possibleReward.toFixed(2));
  });
}

function retrieveUserStaked() {
  mainBettingContract.methods.stakingBalance(selectedAccount).call().then(function(result) {
    console.log("User Stake is: " + JSON.stringify(result));
    var stakeRetrieved = parseInt(result)/10**18;
    $("#userStake").text(stakeRetrieved.toFixed(2));
  });
}


function stake() {
  var valueStaked = myWeb3.utils.toWei($("#valueStaked").val())
  console.log(valueStaked);
  console.log(selectedAccount);
  mainBettingContract.methods.stake(valueStaked).send({ from: selectedAccount }).on("receipt", (function(result) {
    console.log("Value staked response is: " + JSON.stringify(result));
    retrieveUserStaked();
    retrieveTotalStaked();
    retrieveUsdcBalanceOfUser(selectedAccount); 
    })
  ).on("error", function(error) { console.log(error) })

}

function makeABetCall() {
  var valueStaked = $("#betValue").val()
  console.log(valueStaked);
  mainBettingContract.methods.makeABet(valueStaked).send({ from: selectedAccount }).on("receipt", (function(result) {
    console.log("Make a bet value response is: " + JSON.stringify(result));
    retrieveBetFromUser();
   })
  ).on("error", function(error) { console.log(error) })
}


function retrieveBetFromUser() {
  mainBettingContract.methods.getBetFromAddress(selectedAccount).call().then(function(result) {
    for(var i =0; i < result.length; i++) {
        console.log("Bet value response is: " + result[i]);
        $("#bets").append("<td>"  +  result[i]  + "</td>")
    }
  })
}


function checkTime(i) {
  if (i < 10) {
    i = "0" + i;
  }
  return i;
}

function startTime() {
  var today = new Date();
  var h = today.getHours();
  var m = today.getMinutes();
  var s = today.getSeconds();
  // add a zero in front of numbers<10
  m = checkTime(m);
  s = checkTime(s);
  document.getElementById('time').innerHTML = h + ":" + m + ":" + s;
  var t = setTimeout(function() {
    startTime()
  }, 500);
}

startTime();