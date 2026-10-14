# Live Arc mainnet deployment

Chain 5042; production receipts checked on 2026-10-14. Testnet records remain in `deployments/arc-testnet.json`.

| Contract | Mainnet address |
|---|---|
| ccipReceiver | [0x9bC7A8F90e8B26ca1135358938A5542cD9334b92](https://explorer.arc.io/address/0x9bC7A8F90e8B26ca1135358938A5542cD9334b92) |
| contributionRecord | [0x9e38cA5E04c8135e6676D2C6633f9cB5747bE578](https://explorer.arc.io/address/0x9e38cA5E04c8135e6676D2C6633f9cB5747bE578) |
| corpusAudit | [0x69b02DA6F64a2d5962Ef0b4710bAFd85D76e5bC0](https://explorer.arc.io/address/0x69b02DA6F64a2d5962Ef0b4710bAFd85D76e5bC0) |
| corpusManifest | [0x9cAF33dEcfab291D63D451e934eae410a09B0012](https://explorer.arc.io/address/0x9cAF33dEcfab291D63D451e934eae410a09B0012) |
| corpusShares | [0x4E8f310ffc70C9DcaA64f5CaDb5F20a50cE8482d](https://explorer.arc.io/address/0x4E8f310ffc70C9DcaA64f5CaDb5F20a50cE8482d) |
| passkeyRegistry | [0x3a9D0CA0029905dc32f8036BA28DFF33080AC254](https://explorer.arc.io/address/0x3a9D0CA0029905dc32f8036BA28DFF33080AC254) |
| protocol | [0xa8Ec6e8f33F5b5B980336a3cdd3BB799EEA38619](https://explorer.arc.io/address/0xa8Ec6e8f33F5b5B980336a3cdd3BB799EEA38619) |
| salesLog | [0x8095Ea4D12620B4EC116F951C954702832fA6845](https://explorer.arc.io/address/0x8095Ea4D12620B4EC116F951C954702832fA6845) |
| trajectoryCertificate | [0x49082C4AB554003f9b517146a8265E208Ef5067B](https://explorer.arc.io/address/0x49082C4AB554003f9b517146a8265E208Ef5067B) |
| verdicts | [0xe3A583c613B075E61e18da4bFB82b94888721a8e](https://explorer.arc.io/address/0xe3A583c613B075E61e18da4bFB82b94888721a8e) |

## Transactions

- CREATE PasskeyRegistry : [0xff548004e13610692f140d611741d7f59087c6089c717d0e9e01f8b91269cee9](https://explorer.arc.io/tx/0xff548004e13610692f140d611741d7f59087c6089c717d0e9e01f8b91269cee9); status 1; gas 0.0093561930 USDC.
- CREATE ThenarVerdicts : [0x74a5f503b92b413a4ad72ff595c0a5d75c42503a8d6122acef53c4014d2f4a27](https://explorer.arc.io/tx/0x74a5f503b92b413a4ad72ff595c0a5d75c42503a8d6122acef53c4014d2f4a27); status 1; gas 0.0147145110 USDC.
- CREATE ThenarProtocol : [0x37123a1f5fbf0154257ca80d50bdcb62ed0aaa335349e668a24fa23416368e27](https://explorer.arc.io/tx/0x37123a1f5fbf0154257ca80d50bdcb62ed0aaa335349e668a24fa23416368e27); status 1; gas 0.0880583550 USDC.
- CALL ThenarVerdicts setProtocol(address): [0x6d16646fb97aa13337e5007a128154e48f3eddf48fd5c9579dd70d871c79b4c5](https://explorer.arc.io/tx/0x6d16646fb97aa13337e5007a128154e48f3eddf48fd5c9579dd70d871c79b4c5); status 1; gas 0.0009505860 USDC.
- CREATE TrajectoryCertificate : [0x9244c1ceaf0189d462c0fe9c2f034ddc492aafdfe00a3d4d10efc3f19a71c70d](https://explorer.arc.io/tx/0x9244c1ceaf0189d462c0fe9c2f034ddc492aafdfe00a3d4d10efc3f19a71c70d); status 1; gas 0.0205810290 USDC.
- CREATE ContributionRecord : [0xb13d042f978249d53e10465462ea69fae934df2c8e79a6cb44f0fc24a7877be4](https://explorer.arc.io/tx/0xb13d042f978249d53e10465462ea69fae934df2c8e79a6cb44f0fc24a7877be4); status 1; gas 0.0082623030 USDC.
- CREATE CorpusManifest : [0xf7cffb24ff1ba20a3729fe0944e07f475f4157378198d6afab98328f38082d3f](https://explorer.arc.io/tx/0xf7cffb24ff1ba20a3729fe0944e07f475f4157378198d6afab98328f38082d3f); status 1; gas 0.0104436570 USDC.
- CREATE CorpusShares : [0xfa726b6b72b8ef63826fa192847622db6a5a2da4d0ec01f0228a145f557572a1](https://explorer.arc.io/tx/0xfa726b6b72b8ef63826fa192847622db6a5a2da4d0ec01f0228a145f557572a1); status 1; gas 0.0310944270 USDC.
- CREATE SalesLog : [0x4c9f1a1118a9ac965eaa45cab53998f15d3818be3bca6f8bf3270f76156ef107](https://explorer.arc.io/tx/0x4c9f1a1118a9ac965eaa45cab53998f15d3818be3bca6f8bf3270f76156ef107); status 1; gas 0.0094459680 USDC.
- CREATE CorpusAudit : [0xa52e8df8039c5c83c0451ff43d900961f05d487765641aef4cee234d5dea3ecd](https://explorer.arc.io/tx/0xa52e8df8039c5c83c0451ff43d900961f05d487765641aef4cee234d5dea3ecd); status 1; gas 0.0108478860 USDC.
- CREATE ThenarCcipReceiver : [0x56db015fab0f2fb38569c411b143133b8848b05b732ebfa1ba0b958ea57b26b5](https://explorer.arc.io/tx/0x56db015fab0f2fb38569c411b143133b8848b05b732ebfa1ba0b958ea57b26b5); status 1; gas 0.0508426380 USDC.
- CALL  approve(address,uint256): [0x684909cfcd9929ee4f975b5e21017aaefda2dba7a14d44036bde6b3d5acdc290](https://explorer.arc.io/tx/0x684909cfcd9929ee4f975b5e21017aaefda2dba7a14d44036bde6b3d5acdc290); status 1; gas 0.0011641980 USDC.
- CALL ThenarProtocol createTask(string,uint32,uint128,uint8,uint8,uint256): [0x52dc72b71b244efd0586def60b99c33f2336cc081acdd9c75d73838a2fdff218](https://explorer.arc.io/tx/0x52dc72b71b244efd0586def60b99c33f2336cc081acdd9c75d73838a2fdff218); status 1; gas 0.0046842810 USDC.
- CALL ThenarProtocol createTask(string,uint32,uint128,uint8,uint8,uint256): [0xa9a7fabdf4cf90d06d9e1d0a0720f745d19925c56e077524ce72816b2013c1e7](https://explorer.arc.io/tx/0xa9a7fabdf4cf90d06d9e1d0a0720f745d19925c56e077524ce72816b2013c1e7); status 1; gas 0.0043251810 USDC.
- CALL ThenarProtocol createTask(string,uint32,uint128,uint8,uint8,uint256): [0x4d55f342c8e6e58704cb75518e1c72aeec424b8193c365dd0060cd2362ccb778](https://explorer.arc.io/tx/0x4d55f342c8e6e58704cb75518e1c72aeec424b8193c365dd0060cd2362ccb778); status 1; gas 0.0043256850 USDC.
- CALL ThenarProtocol createTask(string,uint32,uint128,uint8,uint8,uint256): [0x0613d82f4af031d1b849d0e6a6950dd058d65792531833ed492c87a596627368](https://explorer.arc.io/tx/0x0613d82f4af031d1b849d0e6a6950dd058d65792531833ed492c87a596627368); status 1; gas 0.0043302210 USDC.
- CALL ThenarProtocol createTaskUntil(string,uint32,uint128,uint8,uint8,uint64,uint256): [0x846b0167d53f91c0887a1368c5b858bc1beaf669bfa76c280f6815f00b34e677](https://explorer.arc.io/tx/0x846b0167d53f91c0887a1368c5b858bc1beaf669bfa76c280f6815f00b34e677); status 1; gas 0.0037560810 USDC.
- service float THENAR_VERIFIER_ADDRESS .15: [0xbaf0e9c7f7b79ce520bdc315dd9f70bd92207039a52351323ffdee136f29a967](https://explorer.arc.io/tx/0xbaf0e9c7f7b79ce520bdc315dd9f70bd92207039a52351323ffdee136f29a967); status 1; gas 0.0004410000 USDC.
- service float THENAR_ISSUER_ADDRESS .15: [0x9b50413e305bc3242b16e0eeeac2639d7c1212865f91887eb64cc33aa0f278b8](https://explorer.arc.io/tx/0x9b50413e305bc3242b16e0eeeac2639d7c1212865f91887eb64cc33aa0f278b8); status 1; gas 0.0004410000 USDC.
- service float THENAR_AUDITOR_ADDRESS .1: [0xe4a9d9533c137ffdcdf3c5d88c298e2d675980cea73fe3c39c542ef752bc9a9c](https://explorer.arc.io/tx/0xe4a9d9533c137ffdcdf3c5d88c298e2d675980cea73fe3c39c542ef752bc9a9c); status 1; gas 0.0004410000 USDC.
- service float RELAYER_ADDRESS .2: [0xb63f7d2453402cfe1135d0b1118f4eb435187c89b47cdead227ad26f4e77307a](https://explorer.arc.io/tx/0xb63f7d2453402cfe1135d0b1118f4eb435187c89b47cdead227ad26f4e77307a); status 1; gas 0.0004410000 USDC.
- service float FACILITATOR_ADDRESS .1: [0xdd63631c985f055bf8b9bc63faf9772aa0789e65b869b14eb61aeb39adae7566](https://explorer.arc.io/tx/0xdd63631c985f055bf8b9bc63faf9772aa0789e65b869b14eb61aeb39adae7566); status 1; gas 0.0004410000 USDC.
- ERC-8004 verifier registration: [0xddb5fcc81c80c0a71e96f83c1195646005c0789c1a682a2f81e99ce8b436683d](https://explorer.arc.io/tx/0xddb5fcc81c80c0a71e96f83c1195646005c0789c1a682a2f81e99ce8b436683d); status 1; gas 0.0037351440 USDC.
- Bind permanent verifier identity: [0xc666c06eb7a6ed0cab89ff4f22e7120ca0c4202ec2e7a82a4537f944658f3f8e](https://explorer.arc.io/tx/0xc666c06eb7a6ed0cab89ff4f22e7120ca0c4202ec2e7a82a4537f944658f3f8e); status 1; gas 0.0014706510 USDC.
- Smoke: verified recorded trajectory, seed reward <=0.05 USDC: [0xe3c2d8c5c715b034083e2ee7916ed7cf5ed4d2cae02a51498956c5232a2d4594](https://explorer.arc.io/tx/0xe3c2d8c5c715b034083e2ee7916ed7cf5ed4d2cae02a51498956c5232a2d4594); status 1; gas 0.0160421520 USDC.
- Sweep smoke reward to deployer: [0xe8516efbd7cf3934dc39d66e87a222f543527e2a39b49bab27f98c2b38702d6c](https://explorer.arc.io/tx/0xe8516efbd7cf3934dc39d66e87a222f543527e2a39b49bab27f98c2b38702d6c); status 1; gas 0.0004410000 USDC.

Total recorded project gas: 0.3010771470 USDC.

Mainnet smoke is script-driven; hosted mainnet browser transactions and cross-chain delivery are Not run. Public testnet proof remains separately labelled. Production role keys are outside this repository.

Explorer source verification: attempted; Blockscout API returned a Cloudflare challenge. Receipt/code checks pass independently.
