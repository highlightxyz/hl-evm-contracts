import {
  AuctionManager,
  ERC721Editions,
  ERC721General,
  ERC721SingleEdition,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  Observability,
} from "@highlightxyz/libnode/contracts/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { setupEditions, setupGeneral, setupSingleEdition, setupSystem } from "./__utils__/helpers";
import { sign2771MetaTxRequest } from "./__utils__/metaTx";

// have to import this here to not import OpenZeppelin minimal forwarder
const MinimalForwarderData = {
  _format: "hh-sol-artifact-1",
  contractName: "MinimalForwarder",
  sourceName: "contracts/metatx/MinimalForwarder.sol",
  abi: [
    {
      inputs: [],
      stateMutability: "nonpayable",
      type: "constructor",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "address",
              name: "from",
              type: "address",
            },
            {
              internalType: "address",
              name: "to",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "value",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "gas",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "nonce",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "data",
              type: "bytes",
            },
          ],
          internalType: "struct MinimalForwarder.ForwardRequest",
          name: "req",
          type: "tuple",
        },
        {
          internalType: "bytes",
          name: "signature",
          type: "bytes",
        },
      ],
      name: "execute",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool",
        },
        {
          internalType: "bytes",
          name: "",
          type: "bytes",
        },
      ],
      stateMutability: "payable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "from",
          type: "address",
        },
      ],
      name: "getNonce",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "address",
              name: "from",
              type: "address",
            },
            {
              internalType: "address",
              name: "to",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "value",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "gas",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "nonce",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "data",
              type: "bytes",
            },
          ],
          internalType: "struct MinimalForwarder.ForwardRequest",
          name: "req",
          type: "tuple",
        },
        {
          internalType: "bytes",
          name: "signature",
          type: "bytes",
        },
      ],
      name: "verify",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
  ],
  bytecode:
    "0x61014060405234801561001157600080fd5b50604080518082018252601081526f26b4b734b6b0b62337b93bb0b93232b960811b602080830191825283518085019094526005845264302e302e3160d81b908401528151902060e08190527fae209a0b48f21c054280f2455d32cf309387644879d9acbd8ffc1991638118856101008190524660a0529192917f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f6100fb8184846040805160208101859052908101839052606081018290524660808201523060a082015260009060c0016040516020818303038152906040528051906020012090509392505050565b6080523060c052610120525061011092505050565b60805160a05160c05160e0516101005161012051610b6261015f600039600061050c0152600061055b015260006105360152600061048f015260006104b9015260006104e30152610b626000f3fe6080604052600436106100345760003560e01c80632d0335ab1461003957806347153f8214610082578063bf5d3bdb146100a3575b600080fd5b34801561004557600080fd5b5061006f6100543660046108fd565b6001600160a01b031660009081526020819052604090205490565b6040519081526020015b60405180910390f35b61009561009036600461092d565b6100d3565b604051610079929190610a28565b3480156100af57600080fd5b506100c36100be36600461092d565b61028c565b6040519015158152602001610079565b600060606100e285858561028c565b61014e5760405162461bcd60e51b815260206004820152603260248201527f4d696e696d616c466f727761726465723a207369676e617475726520646f6573604482015271081b9bdd081b585d18da081c995c5d595cdd60721b60648201526084015b60405180910390fd5b61015d60808601356001610a4b565b60008061016d60208901896108fd565b6001600160a01b03166001600160a01b03168152602001908152602001600020819055506000808660200160208101906101a791906108fd565b6001600160a01b0316606088013560408901356101c760a08b018b610a71565b6101d460208d018d6108fd565b6040516020016101e693929190610ab8565b60408051601f198184030181529082905261020091610ade565b600060405180830381858888f193505050503d806000811461023e576040519150601f19603f3d011682016040523d82523d6000602084013e610243565b606091505b50915091508181906102685760405162461bcd60e51b81526004016101459190610afa565b50610278603f6060890135610b0d565b5a1161028057fe5b90969095509350505050565b60008061039f84848080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525061039992507fdd8f4b70b0f4393e889bd39128a30628a78b61816a9eb8199759e7a349657e4891506102fc905060208a018a6108fd565b61030c60408b0160208c016108fd565b60408b013560608c013560808d013561032860a08f018f610a71565b604051610336929190610b2f565b6040805191829003822060208301989098526001600160a01b0396871690820152949093166060850152608084019190915260a083015260c082015260e0810191909152610100016040516020818303038152906040528051906020012061040a565b9061045e565b905060808501356000806103b660208901896108fd565b6001600160a01b03166001600160a01b031681526020019081526020016000205414801561040157506103ec60208601866108fd565b6001600160a01b0316816001600160a01b0316145b95945050505050565b6000610458610417610482565b8360405161190160f01b6020820152602281018390526042810182905260009060620160405160208183030381529060405280519060200120905092915050565b92915050565b600080600061046d85856105a9565b9150915061047a81610619565b509392505050565b6000306001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000161480156104db57507f000000000000000000000000000000000000000000000000000000000000000046145b1561050557507f000000000000000000000000000000000000000000000000000000000000000090565b50604080517f00000000000000000000000000000000000000000000000000000000000000006020808301919091527f0000000000000000000000000000000000000000000000000000000000000000828401527f000000000000000000000000000000000000000000000000000000000000000060608301524660808301523060a0808401919091528351808403909101815260c0909201909252805191012090565b6000808251604114156105e05760208301516040840151606085015160001a6105d4878285856107d7565b94509450505050610612565b82516040141561060a57602083015160408401516105ff8683836108c4565b935093505050610612565b506000905060025b9250929050565b600081600481111561062d5761062d610b3f565b14156106365750565b600181600481111561064a5761064a610b3f565b14156106985760405162461bcd60e51b815260206004820152601860248201527f45434453413a20696e76616c6964207369676e617475726500000000000000006044820152606401610145565b60028160048111156106ac576106ac610b3f565b14156106fa5760405162461bcd60e51b815260206004820152601f60248201527f45434453413a20696e76616c6964207369676e6174757265206c656e677468006044820152606401610145565b600381600481111561070e5761070e610b3f565b14156107675760405162461bcd60e51b815260206004820152602260248201527f45434453413a20696e76616c6964207369676e6174757265202773272076616c604482015261756560f01b6064820152608401610145565b600481600481111561077b5761077b610b3f565b14156107d45760405162461bcd60e51b815260206004820152602260248201527f45434453413a20696e76616c6964207369676e6174757265202776272076616c604482015261756560f01b6064820152608401610145565b50565b6000807f7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a083111561080e57506000905060036108bb565b8460ff16601b1415801561082657508460ff16601c14155b1561083757506000905060046108bb565b6040805160008082526020820180845289905260ff881692820192909252606081018690526080810185905260019060a0016020604051602081039080840390855afa15801561088b573d6000803e3d6000fd5b5050604051601f1901519150506001600160a01b0381166108b4576000600192509250506108bb565b9150600090505b94509492505050565b6000806001600160ff1b038316816108e160ff86901c601b610a4b565b90506108ef878288856107d7565b935093505050935093915050565b60006020828403121561090f57600080fd5b81356001600160a01b038116811461092657600080fd5b9392505050565b60008060006040848603121561094257600080fd5b833567ffffffffffffffff8082111561095a57600080fd5b9085019060c0828803121561096e57600080fd5b9093506020850135908082111561098457600080fd5b818601915086601f83011261099857600080fd5b8135818111156109a757600080fd5b8760208285010111156109b957600080fd5b6020830194508093505050509250925092565b60005b838110156109e75781810151838201526020016109cf565b838111156109f6576000848401525b50505050565b60008151808452610a148160208601602086016109cc565b601f01601f19169290920160200192915050565b8215158152604060208201526000610a4360408301846109fc565b949350505050565b60008219821115610a6c57634e487b7160e01b600052601160045260246000fd5b500190565b6000808335601e19843603018112610a8857600080fd5b83018035915067ffffffffffffffff821115610aa357600080fd5b60200191503681900382131561061257600080fd5b8284823760609190911b6bffffffffffffffffffffffff19169101908152601401919050565b60008251610af08184602087016109cc565b9190910192915050565b60208152600061092660208301846109fc565b600082610b2a57634e487b7160e01b600052601260045260246000fd5b500490565b8183823760009101908152919050565b634e487b7160e01b600052602160045260246000fdfea164736f6c634300080a000a",
  deployedBytecode:
    "0x6080604052600436106100345760003560e01c80632d0335ab1461003957806347153f8214610082578063bf5d3bdb146100a3575b600080fd5b34801561004557600080fd5b5061006f6100543660046108fd565b6001600160a01b031660009081526020819052604090205490565b6040519081526020015b60405180910390f35b61009561009036600461092d565b6100d3565b604051610079929190610a28565b3480156100af57600080fd5b506100c36100be36600461092d565b61028c565b6040519015158152602001610079565b600060606100e285858561028c565b61014e5760405162461bcd60e51b815260206004820152603260248201527f4d696e696d616c466f727761726465723a207369676e617475726520646f6573604482015271081b9bdd081b585d18da081c995c5d595cdd60721b60648201526084015b60405180910390fd5b61015d60808601356001610a4b565b60008061016d60208901896108fd565b6001600160a01b03166001600160a01b03168152602001908152602001600020819055506000808660200160208101906101a791906108fd565b6001600160a01b0316606088013560408901356101c760a08b018b610a71565b6101d460208d018d6108fd565b6040516020016101e693929190610ab8565b60408051601f198184030181529082905261020091610ade565b600060405180830381858888f193505050503d806000811461023e576040519150601f19603f3d011682016040523d82523d6000602084013e610243565b606091505b50915091508181906102685760405162461bcd60e51b81526004016101459190610afa565b50610278603f6060890135610b0d565b5a1161028057fe5b90969095509350505050565b60008061039f84848080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525061039992507fdd8f4b70b0f4393e889bd39128a30628a78b61816a9eb8199759e7a349657e4891506102fc905060208a018a6108fd565b61030c60408b0160208c016108fd565b60408b013560608c013560808d013561032860a08f018f610a71565b604051610336929190610b2f565b6040805191829003822060208301989098526001600160a01b0396871690820152949093166060850152608084019190915260a083015260c082015260e0810191909152610100016040516020818303038152906040528051906020012061040a565b9061045e565b905060808501356000806103b660208901896108fd565b6001600160a01b03166001600160a01b031681526020019081526020016000205414801561040157506103ec60208601866108fd565b6001600160a01b0316816001600160a01b0316145b95945050505050565b6000610458610417610482565b8360405161190160f01b6020820152602281018390526042810182905260009060620160405160208183030381529060405280519060200120905092915050565b92915050565b600080600061046d85856105a9565b9150915061047a81610619565b509392505050565b6000306001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000161480156104db57507f000000000000000000000000000000000000000000000000000000000000000046145b1561050557507f000000000000000000000000000000000000000000000000000000000000000090565b50604080517f00000000000000000000000000000000000000000000000000000000000000006020808301919091527f0000000000000000000000000000000000000000000000000000000000000000828401527f000000000000000000000000000000000000000000000000000000000000000060608301524660808301523060a0808401919091528351808403909101815260c0909201909252805191012090565b6000808251604114156105e05760208301516040840151606085015160001a6105d4878285856107d7565b94509450505050610612565b82516040141561060a57602083015160408401516105ff8683836108c4565b935093505050610612565b506000905060025b9250929050565b600081600481111561062d5761062d610b3f565b14156106365750565b600181600481111561064a5761064a610b3f565b14156106985760405162461bcd60e51b815260206004820152601860248201527f45434453413a20696e76616c6964207369676e617475726500000000000000006044820152606401610145565b60028160048111156106ac576106ac610b3f565b14156106fa5760405162461bcd60e51b815260206004820152601f60248201527f45434453413a20696e76616c6964207369676e6174757265206c656e677468006044820152606401610145565b600381600481111561070e5761070e610b3f565b14156107675760405162461bcd60e51b815260206004820152602260248201527f45434453413a20696e76616c6964207369676e6174757265202773272076616c604482015261756560f01b6064820152608401610145565b600481600481111561077b5761077b610b3f565b14156107d45760405162461bcd60e51b815260206004820152602260248201527f45434453413a20696e76616c6964207369676e6174757265202776272076616c604482015261756560f01b6064820152608401610145565b50565b6000807f7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a083111561080e57506000905060036108bb565b8460ff16601b1415801561082657508460ff16601c14155b1561083757506000905060046108bb565b6040805160008082526020820180845289905260ff881692820192909252606081018690526080810185905260019060a0016020604051602081039080840390855afa15801561088b573d6000803e3d6000fd5b5050604051601f1901519150506001600160a01b0381166108b4576000600192509250506108bb565b9150600090505b94509492505050565b6000806001600160ff1b038316816108e160ff86901c601b610a4b565b90506108ef878288856107d7565b935093505050935093915050565b60006020828403121561090f57600080fd5b81356001600160a01b038116811461092657600080fd5b9392505050565b60008060006040848603121561094257600080fd5b833567ffffffffffffffff8082111561095a57600080fd5b9085019060c0828803121561096e57600080fd5b9093506020850135908082111561098457600080fd5b818601915086601f83011261099857600080fd5b8135818111156109a757600080fd5b8760208285010111156109b957600080fd5b6020830194508093505050509250925092565b60005b838110156109e75781810151838201526020016109cf565b838111156109f6576000848401525b50505050565b60008151808452610a148160208601602086016109cc565b601f01601f19169290920160200192915050565b8215158152604060208201526000610a4360408301846109fc565b949350505050565b60008219821115610a6c57634e487b7160e01b600052601160045260246000fd5b500190565b6000808335601e19843603018112610a8857600080fd5b83018035915067ffffffffffffffff821115610aa357600080fd5b60200191503681900382131561061257600080fd5b8284823760609190911b6bffffffffffffffffffffffff19169101908152601401919050565b60008251610af08184602087016109cc565b9190910192915050565b60208152600061092660208301846109fc565b600082610b2a57634e487b7160e01b600052601260045260246000fd5b500490565b8183823760009101908152919050565b634e487b7160e01b600052602160045260246000fdfea164736f6c634300080a000a",
  linkReferences: {},
  deployedLinkReferences: {},
};

describe("MetaTransactions functionality", () => {
  let minimalForwarderFanSigner: MinimalForwarder;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    owner: SignerWithAddress,
    fan1: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let observability: Observability;
  let trustedForwarder: MinimalForwarder;
  let editionsImplementation: string;
  let singleEditionImplementation: string;
  let generalImplementation: string;

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, owner, fan1] =
      await ethers.getSigners();
    const {
      emrProxy,
      mintManagerProxy,
      minimalForwarder,
      auctionManagerProxy,
      observability: observabilityInstance,
      editionsImplementationAddress,
      singleEditionImplementationAddress,
      generalImplementationAddress,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      owner,
    );

    emr = emrProxy;
    mintManager = mintManagerProxy;
    trustedForwarder = minimalForwarder;
    observability = observabilityInstance;
    auctionManager = auctionManagerProxy;

    editionsImplementation = editionsImplementationAddress;
    singleEditionImplementation = singleEditionImplementationAddress;
    generalImplementation = generalImplementationAddress;

    mintManager = mintManager.connect(mintManagerOwner);
    minimalForwarderFanSigner = minimalForwarder.connect(fan1);
  });

  describe("MinimalForwarder", function () {
    describe("ERC721Editions", function () {
      let editions: ERC721Editions;

      beforeEach(async function () {
        editions = await setupEditions(
          observability.address,
          editionsImplementation,
          mintManager.address,
          auctionManager.address,
          trustedForwarder.address,
          emr.address,
          owner,
        );
      });

      it("Not encoding enough gas for an operation fails the operation", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: editions.address,
          gas: 30000,
          data: await editions.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith("");
      });

      it("Mismatched signers from the from address of a request are not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: editionsMetadataOwner.address,
          to: editions.address,
          gas: 60000,
          data: await editions.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Mismatched data in a request is not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: editions.address,
          gas: 60000,
          data: await editions.interface.encodeFunctionData("freezeMints"),
        });

        request.gas = 60001;

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Sending a request from a non-trusted forwarder does not invoke meta transaction functionality", async function () {
        // have to do this to not import OpenZeppelin minimal forwarder
        const newMinimalForwarder = (await new ethers.ContractFactory(
          MinimalForwarderData.abi,
          MinimalForwarderData.bytecode,
          fan1,
        ).deploy()) as MinimalForwarder;
        await newMinimalForwarder.deployed();

        // this operation would have succeeded from the trusted forwarder, but since it's not trusted, it fails
        const { signature, request } = await sign2771MetaTxRequest(owner, newMinimalForwarder, {
          from: owner.address,
          to: editions.address,
          gas: 60000,
          data: await editions.interface.encodeFunctionData("freezeMints"),
        });

        expect(await newMinimalForwarder.verify(request, signature)).to.equal(true);
        expect(await editions.isTrustedForwarder(newMinimalForwarder.address)).to.equal(false);
        expect(await editions.isTrustedForwarder(minimalForwarderFanSigner.address)).to.equal(true);

        // TODO: fix HardhatChaiMatchersDecodingError issue. This reverts with Ownable message as expected
        let reverted = false;
        try {
          await expect(newMinimalForwarder.execute(request, signature)).to.emit(editions, "MintsFrozen");
        } catch (error) {
          reverted = true;
        }

        expect(reverted).to.equal(true);
      });

      it("A validly encoded msgSender is allowed to perform operations as expected", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: editions.address,
          gas: 60000,
          data: await editions.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.emit(editions, "MintsFrozen").withArgs();
      });
    });

    describe("ERC721SingleEdition", function () {
      let singleEdition: ERC721SingleEdition;

      beforeEach(async function () {
        singleEdition = await setupSingleEdition(
          observability.address,
          singleEditionImplementation,
          mintManager.address,
          trustedForwarder.address,
          emr.address,
          owner,
          4,
          "name",
          "SYM",
        );
      });

      it("Not encoding enough gas for an operation fails the operation", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: singleEdition.address,
          gas: 30000,
          data: await singleEdition.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith("");
      });

      it("Mismatched signers from the from address of a request are not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: editionsMetadataOwner.address,
          to: singleEdition.address,
          gas: 60000,
          data: await singleEdition.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Mismatched data in a request is not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: singleEdition.address,
          gas: 60000,
          data: await singleEdition.interface.encodeFunctionData("freezeMints"),
        });

        request.gas = 60001;

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Sending a request from a non-trusted forwarder does not invoke meta transaction functionality", async function () {
        // have to do this to not import OpenZeppelin minimal forwarder
        const newMinimalForwarder = (await new ethers.ContractFactory(
          MinimalForwarderData.abi,
          MinimalForwarderData.bytecode,
          fan1,
        ).deploy()) as MinimalForwarder;
        await newMinimalForwarder.deployed();

        // this operation would have succeeded from the trusted forwarder, but since it's not trusted, it fails
        const { signature, request } = await sign2771MetaTxRequest(owner, newMinimalForwarder, {
          from: owner.address,
          to: singleEdition.address,
          gas: 60000,
          data: await singleEdition.interface.encodeFunctionData("freezeMints"),
        });

        expect(await newMinimalForwarder.verify(request, signature)).to.equal(true);
        expect(await singleEdition.isTrustedForwarder(newMinimalForwarder.address)).to.equal(false);
        expect(await singleEdition.isTrustedForwarder(minimalForwarderFanSigner.address)).to.equal(true);

        // TODO: fix HardhatChaiMatchersDecodingError issue. This reverts with Ownable message as expected
        let reverted = false;
        try {
          await expect(newMinimalForwarder.execute(request, signature)).to.emit(singleEdition, "MintsFrozen");
        } catch (error) {
          reverted = true;
        }

        expect(reverted).to.equal(true);
      });

      it("A validly encoded msgSender is allowed to perform operations as expected", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: singleEdition.address,
          gas: 60000,
          data: await singleEdition.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature))
          .to.emit(singleEdition, "MintsFrozen")
          .withArgs();
      });
    });

    describe("ERC721General", function () {
      let general: ERC721General;

      beforeEach(async function () {
        general = await setupGeneral(
          observability.address,
          generalImplementation,
          trustedForwarder.address,
          mintManager.address,
          owner,
        );
      });

      it("Not encoding enough gas for an operation fails the operation", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: general.address,
          gas: 30000,
          data: await general.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith("");
      });

      it("Mismatched signers from the from address of a request are not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: editionsMetadataOwner.address,
          to: general.address,
          gas: 60000,
          data: await general.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Mismatched data in a request is not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: general.address,
          gas: 60000,
          data: await general.interface.encodeFunctionData("freezeMints"),
        });

        request.gas = 60001;

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Sending a request from a non-trusted forwarder does not invoke meta transaction functionality", async function () {
        // have to do this to not import OpenZeppelin minimal forwarder
        const newMinimalForwarder = (await new ethers.ContractFactory(
          MinimalForwarderData.abi,
          MinimalForwarderData.bytecode,
          fan1,
        ).deploy()) as MinimalForwarder;
        await newMinimalForwarder.deployed();

        // this operation would have succeeded from the trusted forwarder, but since it's not trusted, it fails
        const { signature, request } = await sign2771MetaTxRequest(owner, newMinimalForwarder, {
          from: owner.address,
          to: general.address,
          gas: 60000,
          data: await general.interface.encodeFunctionData("freezeMints"),
        });

        expect(await newMinimalForwarder.verify(request, signature)).to.equal(true);
        expect(await general.isTrustedForwarder(newMinimalForwarder.address)).to.equal(false);
        expect(await general.isTrustedForwarder(minimalForwarderFanSigner.address)).to.equal(true);

        // TODO: fix HardhatChaiMatchersDecodingError issue. This reverts with Ownable message as expected
        let reverted = false;
        try {
          await expect(newMinimalForwarder.execute(request, signature)).to.emit(general, "MintsFrozen");
        } catch (error) {
          reverted = true;
        }

        expect(reverted).to.equal(true);
      });

      it("A validly encoded msgSender is allowed to perform operations as expected", async function () {
        const { signature, request } = await sign2771MetaTxRequest(owner, minimalForwarderFanSigner, {
          from: owner.address,
          to: general.address,
          gas: 60000,
          data: await general.interface.encodeFunctionData("freezeMints"),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.emit(general, "MintsFrozen").withArgs();
      });
    });

    describe("MintManager", function () {
      it("Not encoding enough gas for an operation fails the operation", async function () {
        const { signature, request } = await sign2771MetaTxRequest(mintManagerOwner, minimalForwarderFanSigner, {
          from: mintManagerOwner.address,
          to: mintManager.address,
          gas: 2000,
          data: await mintManager.interface.encodeFunctionData("transferOwnership", [fan1.address]),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith("");
      });

      it("Mismatched signers from the from address of a request are not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(mintManagerOwner, minimalForwarderFanSigner, {
          from: editionsMetadataOwner.address,
          to: mintManager.address,
          gas: 60000,
          data: await mintManager.interface.encodeFunctionData("transferOwnership", [fan1.address]),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Mismatched data in a request is not allowed", async function () {
        const { signature, request } = await sign2771MetaTxRequest(mintManagerOwner, minimalForwarderFanSigner, {
          from: mintManagerOwner.address,
          to: mintManager.address,
          gas: 60000,
          data: await mintManager.interface.encodeFunctionData("transferOwnership", [fan1.address]),
        });

        request.gas = 60001;

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(false);

        await expect(minimalForwarderFanSigner.execute(request, signature)).to.be.revertedWith(
          "MinimalForwarder: signature does not match request",
        );
      });

      it("Sending a request from a non-trusted forwarder does not invoke meta transaction functionality", async function () {
        // have to do this to not import OpenZeppelin minimal forwarder
        const newMinimalForwarder = (await new ethers.ContractFactory(
          MinimalForwarderData.abi,
          MinimalForwarderData.bytecode,
          fan1,
        ).deploy()) as MinimalForwarder;
        await newMinimalForwarder.deployed();

        // this operation would have succeeded from the trusted forwarder, but since it's not trusted, it fails
        const { signature, request } = await sign2771MetaTxRequest(mintManagerOwner, newMinimalForwarder, {
          from: mintManagerOwner.address,
          to: mintManager.address,
          gas: 60000,
          data: await mintManager.interface.encodeFunctionData("transferOwnership", [fan1.address]),
        });

        expect(await newMinimalForwarder.verify(request, signature)).to.equal(true);
        expect(await mintManager.isTrustedForwarder(newMinimalForwarder.address)).to.equal(false);
        expect(await mintManager.isTrustedForwarder(minimalForwarderFanSigner.address)).to.equal(true);

        // TODO: fix HardhatChaiMatchersDecodingError issue. This reverts with Ownable message as expected
        let reverted = false;
        try {
          await expect(newMinimalForwarder.execute(request, signature)).to.emit(mintManager, "OwnershipTransferred");
        } catch (error) {
          reverted = true;
        }

        expect(reverted).to.equal(true);
      });

      it("A validly encoded msgSender is allowed to perform operations as expected", async function () {
        const { signature, request } = await sign2771MetaTxRequest(mintManagerOwner, minimalForwarderFanSigner, {
          from: mintManagerOwner.address,
          to: mintManager.address,
          gas: 60000,
          data: await mintManager.interface.encodeFunctionData("transferOwnership", [fan1.address]),
        });

        expect(await minimalForwarderFanSigner.verify(request, signature)).to.equal(true);

        await expect(minimalForwarderFanSigner.execute(request, signature))
          .to.emit(mintManager, "OwnershipTransferred")
          .withArgs(mintManagerOwner.address, fan1.address);
      });
    });
  });
});
