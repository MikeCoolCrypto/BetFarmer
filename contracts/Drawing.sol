// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// USDC 0x2791bca1f2de4661ed88a30c99a7a9449aa84174 
// MIM 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1
// Router 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff
// WMatic 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270
// Beefy MAI USDC 0xebe0c8d842aa5a57d7bef8e524deaba676f91cd1
// Zap in vault 0x540a9f99bb730631bf243a34b19fd00ba8cf315c

// WMATIC Mumbai 0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889
// Chainlink Mumbai BTCUSD 0x007A22900a3B98143368Bd5906f8E17e9867581b

interface IFarmContractUsingZap {
    // beefIn interacts with Uniswap Router to swap tokens before adding them in liquidity and stake them
    //tokenAmountOutMin = getSwapEstimate from Uniswap on the token pair 
    function beefIn(address beefyVault, uint256 tokenAmountOutMin, address tokenIn, uint256 tokenInAmount) external;
    function beefOutAndSwap(address beefyVault, uint256 withdrawAmount, address desiredToken, uint256 desiredTokenOutMin) external;
    function estimateSwap(address beefyVault, address tokenIn, uint256 fullInvestmentIn) external view returns(uint256 swapAmountIn, uint256 swapAmountOut, address swapTokenOut); 
}


interface IUniswapV2Router {
  function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);  
  function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}


contract StakingPart is Ownable {
    
    mapping(address => uint256) public stakingBalance;
    mapping(address => bool) public isStaking;
    mapping(address => uint256) public startTime;
    

    AggregatorV3Interface internal priceFeed;

    event emitBoundaries(int lowerBound, int upperBound);
    event emitWinner(address winners);

    mapping (int => address[]) private betFromEveryone; 
    mapping (address => int[]) private betFromAddress; 
    
    //This is the vault we use to farm
    address farmContract;
    address zapFarmContract;
    
    string public name = "BetFarmer";

    IERC20 private stakeToken;
    
     //address of the Staking Token
    address public staking_token;
    
    uint256 public totalStaked = 0;
    
    event Stake(address indexed from, uint256 amount);
    event Unstake(address indexed from, uint256 amount);
    event YieldWithdraw(address indexed to, uint256 amount);
    
    event Log(string logMessage);
    
  
    //address of the paired token for farming 
    address public pairedTokenForFarm;
    
    //address of the Uniswap Polygon router
    address public UNISWAP_V2_ROUTER = 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff;
    
    //address of WMATIC token.  This is needed because some times it is better to trade through WETH.  
    address public WETH = 0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889;
    
    //ChainLink : BTC USD on polygon
    constructor(
        ) {
            priceFeed = AggregatorV3Interface(0x007A22900a3B98143368Bd5906f8E17e9867581b);
        }

    function setFarmContractAddr(address _farmContract) onlyOwner public {
       farmContract = _farmContract;
    }
    
    function setZapFarmContractAddr(address _zapContract) onlyOwner public {
       zapFarmContract = _zapContract;
    }
    
    function setStakingTokenAddr(address _stakingToken) onlyOwner public {
       staking_token = _stakingToken;
       stakeToken = IERC20(_stakingToken);
    }
    
    function setPairedTokenForFarm(address _pairedToken) onlyOwner public {
       pairedTokenForFarm = _pairedToken;
    }
    
    function getAmountOutMinExt(address _tokenIn, address _tokenOut, uint _amountIn) external view returns (uint) {
      //path is an array of addresses.
      //this path array will have 3 addresses [tokenIn, WETH, tokenOut]
      //the if statement below takes into account if token in or token out is WETH.  then the path is only 2 addresses
      address[] memory path;
      if (_tokenIn == WETH || _tokenOut == WETH) {
          path = new address[](2);
          path[0] = _tokenIn;
          path[1] = _tokenOut;
      } else {
          path = new address[](3);
          path[0] = _tokenIn;
          path[1] = WETH;
          path[2] = _tokenOut;
      }
      uint[] memory amountOutMins = IUniswapV2Router(UNISWAP_V2_ROUTER).getAmountsOut(_amountIn, path);
      return amountOutMins[path.length -1];
    }   
    



    //this function will return the minimum amount from a swap
    //input the 3 parameters below and it will return the minimum amount out
    //this is needed for the swap function above
    function _getAmountOutMin(address _tokenIn, address _tokenOut, uint _amountIn) private view returns (uint) {
      //path is an array of addresses.
      //this path array will have 3 addresses [tokenIn, WETH, tokenOut]
      //the if statement below takes into account if token in or token out is WETH.  then the path is only 2 addresses
      address[] memory path;
      if (_tokenIn == WETH || _tokenOut == WETH) {
          path = new address[](2);
          path[0] = _tokenIn;
          path[1] = _tokenOut;
      } else {
          path = new address[](3);
          path[0] = _tokenIn;
          path[1] = WETH;
          path[2] = _tokenOut;
      }
      uint[] memory amountOutMins = IUniswapV2Router(UNISWAP_V2_ROUTER).getAmountsOut(_amountIn, path);
      return amountOutMins[path.length -1];
    }   
    
    function addTokenToFarmVault(uint amount) private {
         emit Log("Going to add token in the vault");
         uint amountOutMin = _getAmountOutMin(staking_token, pairedTokenForFarm, amount);
         IFarmContractUsingZap(zapFarmContract).beefIn(farmContract, amountOutMin, staking_token, amount);
    }
    
    // Withdraw all the farm tokens from farm contract
    function withdrawFromFarmVault() private {
        emit Log("Going to withdraw");
        uint farmTokenAmount = IERC20(pairedTokenForFarm).balanceOf(address(this));
        (uint256 swapAmountIn, uint256 swapAmountOut, address swapTokenOut) = IFarmContractUsingZap(zapFarmContract).estimateSwap(farmContract, pairedTokenForFarm, farmTokenAmount);
        IFarmContractUsingZap(zapFarmContract).beefOutAndSwap(farmContract, farmTokenAmount, staking_token, swapAmountOut);
    }
    
    function addTokenToFarmVault() private {
        uint totalBalanceOfStakeToken = stakeToken.balanceOf(address(this));
        addTokenToFarmVault(totalBalanceOfStakeToken);
    }
    
    function stake(uint256 amount) public {
        require(amount > 0, "The amount must be positive");

        stakeToken.transferFrom(msg.sender, address(this), amount);
        
        if (!isStaking[msg.sender]) {
            stakingBalance[msg.sender] = 0;    
        }

        stakingBalance[msg.sender] += amount;
        startTime[msg.sender] = block.timestamp;
        isStaking[msg.sender] = true;
        
        totalStaked+=amount;
        
        emit Log("staked part done, going to add token in the vault");
        
        //addTokenToFarmVault();

        emit Stake(msg.sender, amount);
    }

    function unstake(uint256 amount) public {
        require(
            isStaking[msg.sender] = true &&
            stakingBalance[msg.sender] >= amount, 
            "Nothing to unstake or too much to unstake"
        );
        //uint256 yieldTransfer = calculateYieldTotal(msg.sender);
        startTime[msg.sender] = block.timestamp;
        uint256 balTransfer = amount;
        amount = 0;
        stakingBalance[msg.sender] -= balTransfer;
        stakeToken.transfer(msg.sender, balTransfer);
        if(stakingBalance[msg.sender] == 0){
            isStaking[msg.sender] = false;
        }
        totalStaked -= amount;
        emit Unstake(msg.sender, balTransfer);
    }

    
    function calculateYieldTime(address user) public view returns(uint256){
        uint256 end = block.timestamp;
        uint256 totalTime = end - startTime[user];
        return totalTime;
    }

    function calculateYieldTotal(address user) public view returns(uint256) {
        uint256 time = calculateYieldTime(user) * 10**18;
        uint256 rate = 86400;
        uint256 timeRate = time / rate;
        uint256 rawYield = (stakingBalance[user] * timeRate) / 10**18;
        return rawYield;
    } 
    
    
    
    /**
     * Returns the latest price
     */
    function getLatestPrice() public view returns (int) {
        (
            uint80 roundID, 
            int price,
            uint startedAt,
            uint timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        return price;
    }
    
    
    function makeABet(int valueBet) external {
        address[] storage existingAddress = betFromEveryone[valueBet];
        
        int[] storage all_bets = betFromAddress[msg.sender];
        for (uint i = 0; i < all_bets.length; i++) {
           require(all_bets[i] != valueBet, "You already added this bet.");
        }
        
        existingAddress.push(msg.sender);
        
        betFromAddress[msg.sender].push(valueBet);
        betFromEveryone[valueBet] = existingAddress;
    }

    // Winners are the lucky ones who had a 0.99price < number < 1.1price  
    function drawTheWinners() public onlyOwner {
        int latestBTCUSD = getLatestPrice() / 10**8;
    
        int belowPercent = latestBTCUSD * 995 / 1000;
        int abovePercent = latestBTCUSD * 1005 / 1000;
        
        emit emitBoundaries(belowPercent, abovePercent);
        
        uint countOfWinner = 0;

        for (int i = belowPercent; i < abovePercent; i++ ) 
        {
            if (betFromEveryone[i].length != 0) {
                for (uint j = 0; j < betFromEveryone[i].length; j++) {
                    countOfWinner++;
                }
            }
        }
        
        for (int i = belowPercent; i < abovePercent; i++ ) 
        {
            if (betFromEveryone[i].length != 0) {
                for (uint j = 0; j < betFromEveryone[i].length; j++) {
                    emit emitWinner(betFromEveryone[i][j]);
                    stakingBalance[betFromEveryone[i][j]] = totalStaked/countOfWinner;
                }
            }
        }
    }
    
    function getAddressesWhoBet(int valueBet) public view returns (address[] memory) {
         return betFromEveryone[valueBet];
    }
    
    function getBetFromAddress(address better) public view returns (int[] memory) {
         return betFromAddress[better];
    }

    function getTotalStaked() public view returns (uint256) {
        return totalStaked;
    }

    function getStakeTokenBalance() public view returns (uint256) {
        return stakeToken.balanceOf(msg.sender);
    }
}
