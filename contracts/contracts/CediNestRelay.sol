// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/// @title CediNestRelay
/// @notice Moves a user's USDT0 into their own Aave position and back, paid for by a relayer.
///         Funds always end with the signer: supply onBehalfOf = owner, withdraw to = owner.
contract CediNestRelay is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;    // USDT0 on Polygon
    IERC20 public immutable aToken;  // aPolUSDT
    IAavePool public immutable pool; // Aave v3 Pool
    address public relayer;

    event RelayerSet(address indexed relayer);
    event Deposited(address indexed owner, uint256 amount, bytes32 indexed jobId);
    event Withdrawn(address indexed owner, uint256 aTokenAmount, uint256 usdtOut, bytes32 indexed jobId);

    error NotRelayer();
    error PermitFailed();

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(address usdt_, address aToken_, address pool_, address relayer_, address owner_) Ownable(owner_) {
        usdt = IERC20(usdt_);
        aToken = IERC20(aToken_);
        pool = IAavePool(pool_);
        relayer = relayer_;
        IERC20(usdt_).forceApprove(pool_, type(uint256).max);
        emit RelayerSet(relayer_);
    }

    function setRelayer(address relayer_) external onlyOwner {
        relayer = relayer_;
        emit RelayerSet(relayer_);
    }

    /// @dev Tolerates a permit that someone already submitted (front-run): falls back to the allowance.
    function _permit(IERC20 token, address owner, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        try IERC20Permit(address(token)).permit(owner, address(this), value, deadline, v, r, s) {}
        catch {
            if (token.allowance(owner, address(this)) < value) revert PermitFailed();
        }
    }

    function depositFor(address owner, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes32 jobId)
        external onlyRelayer nonReentrant
    {
        _permit(usdt, owner, amount, deadline, v, r, s);
        usdt.safeTransferFrom(owner, address(this), amount);
        pool.supply(address(usdt), amount, owner, 0);
        emit Deposited(owner, amount, jobId);
    }

    /// @param amount aPolUSDT to pull; type(uint256).max = everything the owner holds now.
    function withdrawFor(address owner, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes32 jobId)
        external onlyRelayer nonReentrant
    {
        _permit(aToken, owner, amount, deadline, v, r, s);
        uint256 pull = amount == type(uint256).max ? aToken.balanceOf(owner) : amount;
        uint256 before = aToken.balanceOf(address(this));
        aToken.safeTransferFrom(owner, address(this), pull);
        uint256 received = aToken.balanceOf(address(this)) - before;
        uint256 out = pool.withdraw(address(usdt), received, owner);
        emit Withdrawn(owner, received, out, jobId);
    }
}
