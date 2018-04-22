import { Injectable } from '@angular/core';
import {ApiService} from "./api.service";
import {UtilService} from "./util.service";
import * as blake from 'blakejs';
import {WorkPoolService} from "./work-pool.service";
import BigNumber from "bignumber.js";
import {NotificationService} from "./notification.service";
const nacl = window['nacl'];

const STATE_BLOCK_PREAMBLE = '0000000000000000000000000000000000000000000000000000000000000006';

@Injectable()
export class NanoBlockService {
  representativeAccount = 'blt_1ysz9ssfuxdbwix49fky77axfxontx6f7nzy9pwnim398aerg79pigupakgt'; // BoltVault Representative
  shouldGenStateBlocks = true; // Generate state blocks instead of legacy blocks

  constructor(private api: ApiService, private util: UtilService, private workPool: WorkPoolService, private notifications: NotificationService) { }

  async generateChange(walletAccount, representativeAccount) {
    const toAcct = await this.api.accountInfo(walletAccount.id);
    if (!toAcct) throw new Error(`Account must have an open block first`);

    let blockData;
    if (this.shouldGenStateBlocks) {
      const balance = new BigNumber(toAcct.balance);
      const balanceDecimal = balance.toString(10);
      let balancePadded = balance.toString(16);
      while (balancePadded.length < 32) balancePadded = '0' + balancePadded; // Left pad with 0's
      let link = '0000000000000000000000000000000000000000000000000000000000000000';
      let context = blake.blake2bInit(32, null);
      blake.blake2bUpdate(context, this.util.hex.toUint8(STATE_BLOCK_PREAMBLE));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(walletAccount.id)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(toAcct.frontier));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(representativeAccount)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(balancePadded));
      blake.blake2bUpdate(context, this.util.hex.toUint8(link));
      const hashBytes = blake.blake2bFinal(context);

      const privKey = walletAccount.keyPair.secretKey;
      const signed = nacl.sign.detached(hashBytes, privKey);
      const signature = this.util.hex.fromUint8(signed);

      if (!this.workPool.workExists(toAcct.frontier)) {
        this.notifications.sendInfo(`Generating Proof of Work...`);
      }

      blockData = {
        type: 'state',
        account: walletAccount.id,
        previous: toAcct.frontier,
        representative: representativeAccount,
        balance: balanceDecimal,
        link: link,
        signature: signature,
        work: await this.workPool.getWork(toAcct.frontier),
      };
    } else {
      let context = blake.blake2bInit(32, null);
      blake.blake2bUpdate(context, this.util.hex.toUint8(toAcct.frontier));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(representativeAccount)));
      const hashBytes = blake.blake2bFinal(context);

      const privKey = walletAccount.keyPair.secretKey;
      const signed = nacl.sign.detached(hashBytes, privKey);
      const signature = this.util.hex.fromUint8(signed);

      if (!this.workPool.workExists(toAcct.frontier)) {
        this.notifications.sendInfo(`Generating Proof of Work...`);
      }

      blockData = {
        type: 'change',
        previous: toAcct.frontier,
        representative: representativeAccount,
        signature: signature,
        work: await this.workPool.getWork(toAcct.frontier),
      };
    }

    const processResponse = await this.api.process(blockData);
    if (processResponse && processResponse.hash) {
      walletAccount.frontier = processResponse.hash;
      this.workPool.addWorkToCache(processResponse.hash); // Add new hash into the work pool
      this.workPool.removeFromCache(toAcct.frontier);
      return processResponse.hash;
    } else {
      return null;
    }
  }

  async generateSend(walletAccount, toAccountID, rawAmount) {
    const fromAccount = await this.api.accountInfo(walletAccount.id);
    if (!fromAccount) throw new Error(`Unable to get account information for ${walletAccount.id}`);

    const remaining = new BigNumber(fromAccount.balance).minus(rawAmount);
    const remainingDecimal = remaining.toString(10);
    let remainingPadded = remaining.toString(16);
    while (remainingPadded.length < 32) remainingPadded = '0' + remainingPadded; // Left pad with 0's

    let blockData;
    if (this.shouldGenStateBlocks) {
      const context = blake.blake2bInit(32, null);
      blake.blake2bUpdate(context, this.util.hex.toUint8(STATE_BLOCK_PREAMBLE));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(walletAccount.id)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(fromAccount.frontier));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(this.representativeAccount)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(remainingPadded));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(toAccountID)));
      const hashBytes = blake.blake2bFinal(context);

      // Sign the hash bytes with the account priv key bytes
      const signed = nacl.sign.detached(hashBytes, walletAccount.keyPair.secretKey);
      const signature = this.util.hex.fromUint8(signed);

      if (!this.workPool.workExists(fromAccount.frontier)) {
        this.notifications.sendInfo(`Generating Proof of Work...`);
      }

      blockData = {
        type: 'state',
        account: walletAccount.id,
        previous: fromAccount.frontier,
        representative: this.representativeAccount,
        balance: remainingDecimal,
        link: this.util.account.getAccountPublicKey(toAccountID),
        work: await this.workPool.getWork(fromAccount.frontier),
        signature: signature,
      };
    } else {
      const context = blake.blake2bInit(32, null);
      blake.blake2bUpdate(context, this.util.hex.toUint8(fromAccount.frontier));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(toAccountID)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(remainingPadded));
      const hashBytes = blake.blake2bFinal(context);

      // Sign the hash bytes with the account priv key bytes
      const signed = nacl.sign.detached(hashBytes, walletAccount.keyPair.secretKey);
      const signature = this.util.hex.fromUint8(signed);

      if (!this.workPool.workExists(fromAccount.frontier)) {
        this.notifications.sendInfo(`Generating Proof of Work...`);
      }

      blockData = {
        type: 'send',
        previous: fromAccount.frontier,
        destination: toAccountID,
        balance: remainingPadded,
        work: await this.workPool.getWork(fromAccount.frontier),
        signature: signature,
      };
    }

    const processResponse = await this.api.process(blockData);
    if (!processResponse || !processResponse.hash) throw new Error(processResponse.error || `Node returned an error`);

    walletAccount.frontier = processResponse.hash;
    this.workPool.addWorkToCache(processResponse.hash); // Add new hash into the work pool
    this.workPool.removeFromCache(fromAccount.frontier);

    return processResponse.hash;
  }

  async generateReceive(walletAccount, sourceBlock) {
    const toAcct = await this.api.accountInfo(walletAccount.id);
    let blockData: any = {};
    let workBlock = null;

    const openEquiv = !toAcct || !toAcct.frontier;

    if (this.shouldGenStateBlocks) {
      const previousBlock = toAcct.frontier || "0000000000000000000000000000000000000000000000000000000000000000";

      const srcBlockInfo = await this.api.blocksInfo([sourceBlock]);
      const srcAmount = new BigNumber(srcBlockInfo.blocks[sourceBlock].amount);
      const newBalance = openEquiv ? srcAmount : new BigNumber(toAcct.balance).plus(srcAmount);
      const newBalanceDecimal = newBalance.toString(10);
      let newBalancePadded = newBalance.toString(16);
      while (newBalancePadded.length < 32) newBalancePadded = '0' + newBalancePadded; // Left pad with 0's

      const context = blake.blake2bInit(32, null);
      blake.blake2bUpdate(context, this.util.hex.toUint8(STATE_BLOCK_PREAMBLE));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(walletAccount.id)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(previousBlock));
      blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(this.representativeAccount)));
      blake.blake2bUpdate(context, this.util.hex.toUint8(newBalancePadded));
      blake.blake2bUpdate(context, this.util.hex.toUint8(sourceBlock));
      const hashBytes = blake.blake2bFinal(context);

      const privKey = walletAccount.keyPair.secretKey;
      const signed = nacl.sign.detached(hashBytes, privKey);
      const signature = this.util.hex.fromUint8(signed);

      workBlock = openEquiv ? this.util.account.getAccountPublicKey(walletAccount.id) : previousBlock;
      blockData = {
        type: 'state',
        account: walletAccount.id,
        previous: previousBlock,
        representative: this.representativeAccount,
        balance: newBalanceDecimal,
        link: sourceBlock,
        signature: signature,
        work: null
      };
    } else {
      if (openEquiv) {
        // This is an open block!
        const context = blake.blake2bInit(32, null);
        blake.blake2bUpdate(context, this.util.hex.toUint8(sourceBlock));
        blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(this.representativeAccount)));
        blake.blake2bUpdate(context, this.util.hex.toUint8(this.util.account.getAccountPublicKey(walletAccount.id)));
        const hashBytes = blake.blake2bFinal(context);

        const privKey = walletAccount.keyPair.secretKey;
        const signed = nacl.sign.detached(hashBytes, privKey);
        const signature = this.util.hex.fromUint8(signed);
        const PK = this.util.account.getAccountPublicKey(walletAccount.id);

        workBlock = PK;
        blockData = {
          type: 'open',
          account: walletAccount.id,
          representative: this.representativeAccount,
          source: sourceBlock,
          signature: signature,
          work: null,
        };
      } else {
        // This is a receive block
        const previousBlock = toAcct.frontier;
        const context = blake.blake2bInit(32, null);
        blake.blake2bUpdate(context, this.util.hex.toUint8(previousBlock));
        blake.blake2bUpdate(context, this.util.hex.toUint8(sourceBlock));
        const hashBytes = blake.blake2bFinal(context);

        const privKey = walletAccount.keyPair.secretKey;
        const signed = nacl.sign.detached(hashBytes, privKey);
        const signature = this.util.hex.fromUint8(signed);

        workBlock = previousBlock;
        blockData = {
          type: 'receive',
          previous: previousBlock,
          source: sourceBlock,
          signature: signature,
          work: null,
        };
      }
    }

    if (!this.workPool.workExists(workBlock)) {
      this.notifications.sendInfo(`Generating Proof of Work...`);
    }

    blockData.work = await this.workPool.getWork(workBlock);
    const processResponse = await this.api.process(blockData);
    if (processResponse && processResponse.hash) {
      walletAccount.frontier = processResponse.hash;
      this.workPool.addWorkToCache(processResponse.hash); // Add new hash into the work pool
      this.workPool.removeFromCache(workBlock);
      return processResponse.hash;
    } else {
      return null;
    }

  }

}
