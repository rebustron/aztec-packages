import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNodeService } from '@aztec/aztec-node';
import { type DebugLogger, type SentTx } from '@aztec/aztec.js';
import { CompleteAddress, TxStatus } from '@aztec/aztec.js';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { type SpamContract } from '@aztec/noir-contracts.js';
import { type PXEService, createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe';

import { expect } from '@jest/globals';

import { type NodeContext } from '../fixtures/setup_p2p_test.js';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (logger: DebugLogger, spamContract: SpamContract, numTxs: number) => {
  const txs: SentTx[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    // TODO: check out batch call for deployments

    // Send a public mint tx - this will be minted from the token contract to the pxe account
    // const tx = token.methods.mint_public(accountManager.getCompleteAddress().address, 1n).send()
    const tx = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, false, true).send();
    const txHash = await tx.getTxHash();

    logger.info(`Tx sent with hash ${txHash}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger.info(`Receipt received for ${txHash}`);
    txs.push(tx);
  }
  return txs;
};

// creates an instance of the PXE and submit a given number of transactions to it.
export const createPXEServiceAndSubmitTransactions = async (
  logger: DebugLogger,
  node: AztecNodeService,
  numTxs: number,
): Promise<NodeContext> => {
  const rpcConfig = getRpcConfig();
  const pxeService = await createPXEService(node, rpcConfig, true);

  const secretKey = Fr.random();
  const completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, Fr.random());
  await pxeService.registerAccount(secretKey, completeAddress.partialAddress);

  const txs = await submitTxsTo(logger, pxeService, numTxs);
  return {
    txs,
    account: completeAddress.address,
    pxeService,
    node,
  };
};

// submits a set of transactions to the provided Private eXecution Environment (PXE)
const submitTxsTo = async (logger: DebugLogger, pxe: PXEService, numTxs: number) => {
  const txs: SentTx[] = [];
  for (let i = 0; i < numTxs; i++) {
    const accountManager = getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod.create({
      contractAddressSalt: accountManager.salt,
      skipClassRegistration: true,
      skipPublicDeployment: true,
      universalDeploy: true,
    });
    await deployMethod.prove({});
    const tx = deployMethod.send();

    const txHash = await tx.getTxHash();

    logger.info(`Tx sent with hash ${txHash}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger.info(`Receipt received for ${txHash}`);
    txs.push(tx);
  }
  return txs;
};