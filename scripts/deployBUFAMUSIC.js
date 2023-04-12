require("dotenv").config();
const { TRUSTED_FORWARDER, DATOCMS_API_KEY } = process.env;

const { ethers, network, run } = require("hardhat");
const { parseUnits } = require("ethers/lib/utils");

const { BigNumber } = ethers;
const fs = require("fs");

const polygonDeployment = JSON.parse(
  fs.readFileSync(`./data/results/deployment/polygon.json`)
);
const mumbaiDeployment = JSON.parse(
  fs.readFileSync(`./data/results/deployment/mumbai.json`)
);

async function verify(name, address, constructorArguments = []) {
  try {
    await run(`verify:verify`, {
      address,
      constructorArguments
    });
    console.log(`${name} verified on Polygonscan`);
  } catch (e) {
    console.error(`Cannot verify ${name}`, e);
  }
}

async function main() {
  console.log(`Deploying BUFA MUSIC contracts to ${network.name}...`);

  const { BOTVContractAddress, BUFAContractAddress, CurrencyAddress } =
    network.name === "polygon" ? polygonDeployment : mumbaiDeployment;

  const BUFADeployer = await ethers.getContractFactory("BUFA");
  const BUFA = await BUFADeployer.attach(BUFAContractAddress);

  const BURNER_ROLE = await BUFA.SPENDER_ROLE();

  const BUFAMUSICDeployer = await ethers.getContractFactory("BUFAMUSIC");
  const BUFAMUSIC = await BUFAMUSICDeployer.deploy(
    BOTVContractAddress,
    BUFAContractAddress,
    TRUSTED_FORWARDER
  );
  await BUFAMUSIC.deployed();

  console.log("BUFA MUSIC contract deployed : ", BUFAMUSIC.address);

  fs.writeFileSync(
    `./data/results/deployment/${network.name}.json`,
    JSON.stringify(
      {
        BOTVContractAddress,
        BUFAContractAddress,
        CurrencyAddress,
        MusicContractAddress: BUFAMUSIC.address
      },
      null,
      2
    )
  );

  await BUFA.grantRole(BURNER_ROLE, BUFAMUSIC.address);

  console.log("Role granted");

  let res = await fetch("https://graphql.datocms.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${DATOCMS_API_KEY}`
    },
    body: JSON.stringify({
      query: `{
        allMusicNfts {
          id
          songTitle
          iswc
          supply
          bufaPrice          
          mintActive
          tokenActive
        }
      }`
    })
  });
  res = await res.json();
  const {
    data: { allMusicNfts }
  } = res;

  for (let {
    id,
    songTitle,
    iswc,
    supply,
    bufaPrice,
    mintActive,
    tokenActive
  } of allMusicNfts) {
    bufaPrice =
      network.name === "polygon"
        ? parseUnits(bufaPrice.toString(), "ether")
        : parseUnits((bufaPrice / 1000).toString(), "ether");
    await BUFAMUSIC.updateTokenParameter(
      id,
      songTitle,
      iswc,
      supply,
      bufaPrice,
      mintActive,
      tokenActive
    );
    console.log(`Added music nft ${id}`);
  }

  console.log("Ready to verify BUFAMUSIC");

  await verify("BUFAMUSIC", BUFAMUSIC.address, [
    BOTVContractAddress,
    BUFAContractAddress,
    TRUSTED_FORWARDER
  ]);

  console.log("Deploy OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
