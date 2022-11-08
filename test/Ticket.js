const {
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const DECIMALS = ethers.BigNumber.from(10).pow(18)
const MULTISIG = "0x78000b0605E81ea9df54b33f72ebC61B5F5c8077"
describe("Ticket", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployTicketFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();
    const GOHM = await ethers.getContractFactory("MockGOHM");
    const gohm = await GOHM.deploy();
    await gohm.deployed();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.deployed();
    const FRAX = await ethers.getContractFactory("MockFRAX");
    const frax = await FRAX.deploy();
    await frax.deployed();
    const DAI = await ethers.getContractFactory("MockDAI");
    const dai = await DAI.deploy();
    await dai.deployed();
    
    const Ticket = await ethers.getContractFactory("Ticket");
    const ticket = await Ticket.deploy(MULTISIG, "0x0000000000000000000000000000000000000000", gohm.address, usdc.address, frax.address, dai.address);

    const INPERSONTICKETNFT = await ethers.getContractFactory("InPersonTicketNFT");
    const inPersonTicketNFT = await INPERSONTICKETNFT.deploy(ticket.address);
    await inPersonTicketNFT.deployed();
    await inPersonTicketNFT.setTicketInventories(1);
    expect((await inPersonTicketNFT.ticketInventories()).toNumber()).to.equal(1);
    
    await ticket.setInPersonTicketNFTAddr(inPersonTicketNFT.address);

    // set ticket price
    await ticket.setTicketPrice("2022-in-person", true, 33);
    await ticket.setTicketPrice("2022-in-person", false, 3);

    return { ticket, inPersonTicketNFT, dai, owner, otherAccount };
  }

  async function _buyTicket() {
    const { ticket, dai, otherAccount, inPersonTicketNFT } = await loadFixture(deployTicketFixture);
    await dai.transfer(otherAccount.address, ethers.utils.parseUnits("33", 18));

    await dai.connect(otherAccount).approve(ticket.address, ethers.utils.parseUnits("33", 18))
    await ticket.connect(otherAccount).buyTicket("dai", "2022-in-person", true)
    return { ticket, dai, otherAccount, inPersonTicketNFT };

  }

  describe("Test Ticket Contract", function () {
    it("setTicketPrice: Should set the right unlockTime", async function () {
      const { ticket } = await loadFixture(deployTicketFixture);
      expect((await ticket.usdTicketPrices("2022-in-person")).toNumber()).to.equal(33);
      expect((await ticket.gohmTicketPrices("2022-in-person")).toNumber()).to.equal(3);
    });

    it("Should set the right owner", async function () {
      const { ticket, owner } = await loadFixture(deployTicketFixture);
      expect(await ticket.owner()).to.equal(owner.address);
    });

    it("buyTicket: Shoud charge user token and mint them NFT as ticket!", async function () {
      const { ticket, dai, otherAccount, inPersonTicketNFT } = await loadFixture(_buyTicket);
      const ownerBalance = await dai.balanceOf(otherAccount.address);
      expect(ownerBalance.toNumber()).to.equal(0);
      expect((await inPersonTicketNFT.balanceOf(otherAccount.address)).toNumber()).to.equal(1);
      expect((await inPersonTicketNFT.ownerOf(1))).to.equal(otherAccount.address);
      
      const balanceOfTicketContract = (await dai.balanceOf(ticket.address)).div(DECIMALS)
      expect(balanceOfTicketContract.toNumber()).to.equal(33);
    });

    it("withdrawToken: Shoud withdraw token to user wallet!", async function () {
      // withdraw!
      const { ticket, dai } = await loadFixture(_buyTicket);
      await ticket.withdrawToken()
      const balanceOfOwnerWallet = (await dai.balanceOf(MULTISIG)).div(DECIMALS)
      expect(balanceOfOwnerWallet.toNumber()).to.equal(33);
      expect((await dai.balanceOf(ticket.address)).div(DECIMALS).toNumber()).to.equal(0);
    });

    it("withdrawToken: Should withdraw ticket revenue to multi-sig wallet!", async function () {
      // here we use owner's address as multi-sig wallet!
      const { ticket, owner } = await loadFixture(deployTicketFixture);
      expect(await ticket.owner()).to.equal(owner.address);
    });
    
  });
  describe("Test inPersonTicketNFT Contract", function () {
    it("Should raise revert transaction when it exceeds ticket inventories!", async function () {
      const { ticket, owner, dai, otherAccount, inPersonTicketNFT } = await loadFixture(deployTicketFixture);
      await dai.transfer(otherAccount.address, ethers.utils.parseUnits("33", 18));
      await dai.connect(otherAccount).approve(ticket.address, ethers.utils.parseUnits("33", 18))
      await ticket.connect(otherAccount).buyTicket("dai", "2022-in-person", true)
      expect((await inPersonTicketNFT.tokenIds()).toNumber()).to.equal(1);
      try {
        await ticket.connect(otherAccount).buyTicket("dai", "2022-in-person", true)
      } catch (error) {
        // Exceed ticket inventories!
        expect(error.message).to.equal("VM Exception while processing transaction: reverted with reason string 'Error'")
      }
    });    
  });
});
