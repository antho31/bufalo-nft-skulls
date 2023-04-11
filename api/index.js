/**
 * - Run `npm run dev-api` in the terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see worker in action
 * - Run `npm run deploy-api` to publish worker
 */
const envs = require("../env.json");
const { Router } = require("itty-router");
const { Network } = require("alchemy-sdk");

const { BigNumber } = require("ethers");

// const privateSaleMerkle = require("../data/results/merkleAllowlists/community.json");
const discountMerkle = require("../data/results/merkleAllowlists/fans.json");
const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");
// const rarities = require("../data/results/metadata/BOTV/rarities.json");

const mumbaiDeployment = require(`../data/results/deployment/mumbai.json`);
const polygonDeployment = require(`../data/results/deployment/polygon.json`);

// Create a new router
const router = Router();

router.get("/deployment/:network", ({ params: { network } }) => {
  let data =
    network === "mumbai"
      ? mumbaiDeployment
      : network === "polygon"
      ? polygonDeployment
      : {};

  const json = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
});

router.get(
  "/merkleproofs/rewards/:metadataIds",
  ({ params: { metadataIds } }) => {
    const metadataIdsArray = metadataIds.split(",");
    const data = {
      error: false,
      invalidIds: [],
      metadataIds: metadataIdsArray,
      rewardsPerDay: [],
      rewardsProofs: []
    };

    for (const metadataId of metadataIdsArray) {
      if (bufaMerkle[metadataId]) {
        const { bufaPerDay, merkleProofs } = bufaMerkle[metadataId];
        data.rewardsPerDay.push(bufaPerDay);
        data.rewardsProofs.push(merkleProofs);
      } else {
        data.error = true;
        data.invalidIds.push(metadataId);
        data.rewardsPerDay.push(null);
        data.rewardsProofs.push(null);
      }
    }

    const json = JSON.stringify(data, null, 2);

    return new Response(json, {
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
);

router.get("/merkleproofs/:addr", async ({ params: { addr } }) => {
  addr = addr.toLocaleLowerCase();

  let privateSaleMerkle = await fetch(
    `https://raw.githubusercontent.com/antho31/bufalo-nft-skulls/main/data/results/merkleAllowlists/community.json`
  );
  privateSaleMerkle = await privateSaleMerkle.json();

  const data = {
    addr,
    privateSaleMerkleProof: privateSaleMerkle[addr]
      ? privateSaleMerkle[addr]
      : [],
    discountMerkleProof: discountMerkle[addr] ? discountMerkle[addr] : []
  };

  const json = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
});

router.get("/musicnftmetadata/:tokenId", async ({ params: { tokenId } }) => {
  try {
    const { DATOCMS_API_KEY } = envs;

    let res = await fetch("https://graphql.datocms.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${DATOCMS_API_KEY}`
      },
      body: JSON.stringify({
        query: `{
          allMusicNfts(filter: {  id: { eq: "${tokenId}" }}) {
            id
            songTitle
            supply
            bufaPrice
            cover {
              url
            }
            audioFile {
              url
            }
            pdfContract {
              url
            }
            mintActive
            tokenActive
            iswc
            description
            cocv
            depositDate
            tax
            genre
            origin
          }
        }`
      })
    });
    res = await res.json();
    const {
      data: {
        allMusicNfts: [dataForToken]
      }
    } = res;

    if (dataForToken) {
      const {
        // id,
        songTitle,
        //  supply,
        //  bufaPrice,
        cover: { url: coverUrl },
        audioFile: { url: audioUrl },
        // pdfContract: { url: pdfUrl },
        //  mintActive,
        //  tokenActive,
        iswc,
        description,
        cocv,
        depositDate,
        tax,
        genre,
        origin
      } = dataForToken;

      const metadata = {
        attributes: [
          {
            trait_type: "ISWC",
            value: iswc
          },
          {
            trait_type: "COCV",
            value: cocv
          },
          {
            trait_type: "Tax",
            value: tax
          },
          {
            trait_type: "Genre",
            value: genre
          },
          {
            trait_type: "Origin",
            value: origin
          }
        ],
        animation_url: audioUrl,
        description: `Holders get commercial rights for [this song](${audioUrl})`,
        image: coverUrl,
        name: songTitle
      };

      const json = JSON.stringify(metadata, null, 2);

      return new Response(json, {
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } else {
      new Response("404, not found!", { status: 404 });
    }
  } catch (e) {
    console.error(e);
    new Response(e, { status: 500 });
  }
});

router.get(
  "/tokensForOwner/:chain/:addr",
  async ({ params: { addr, chain } }) => {
    const network =
      chain === "polygon"
        ? Network.MATIC_MAINNET
        : chain === "mumbai"
        ? Network.MATIC_MUMBAI
        : undefined;
    const apiKey = envs.ALCHEMY_API_KEY;

    if (network && addr) {
      try {
        const contractAddress =
          chain === "polygon"
            ? polygonDeployment.BOTVContractAddress
            : chain === "mumbai"
            ? mumbaiDeployment.BOTVContractAddress
            : undefined;

        const alchemyResponse = await fetch(
          `https://${network}.g.alchemy.com/nft/v2/${apiKey}/getNFTs?owner=${addr}&contractAddresses[]=${contractAddress}&withMetadata=true&pageSize=100`
        );
        const { ownedNfts } = JSON.parse(await gatherResponse(alchemyResponse));

        const raritiesResponse = await fetch(
          `https://raw.githubusercontent.com/antho31/bufalo-nft-skulls/main/data/results/metadata/BOTV/rarities.json`
        );
        const rarities = JSON.parse(await gatherResponse(raritiesResponse));

        const tokenIds = [];
        const metadataIds = [];
        const rewardsPerDay = [];
        const rewardsProofs = [];
        const tokenData = [];

        for (let { id, title, media, metadata } of ownedNfts) {
          let rank, metadataId;
          let { tokenId } = id;
          tokenId = BigNumber.from(tokenId).toString();
          tokenIds.push(tokenId);
          const titleSplit = title.split("#");
          if (titleSplit.length === 2) {
            metadataId = titleSplit[1];
            const { bufaPerDay, merkleProofs } = bufaMerkle[metadataId];
            metadataIds.push(metadataId);
            rewardsPerDay.push(bufaPerDay);
            rewardsProofs.push(merkleProofs);
            rank = rarities.metadatas[metadataId].rank;
          }
          tokenData.push({
            tokenId,
            metadataId,
            rank,
            title,
            media,
            metadata
          });
        }
        const json = JSON.stringify(
          {
            tokenIds,
            metadataIds,
            rewardsPerDay,
            rewardsProofs,
            tokenData
          },
          null,
          2
        );

        return new Response(json, {
          headers: {
            "content-type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (e) {
        console.error(e);
        new Response(e, { status: 500 });
      }
    } else {
      new Response("404, not found!", { status: 404 });
    }
  }
);

router.all("*", () => new Response("404, not found!", { status: 404 }));

addEventListener("fetch", (event) => {
  event.respondWith(router.handle(event.request));
});

/**
 * gatherResponse awaits and returns a response body as a string.
 * Use await gatherResponse(..) in an async function to get the response body
 * @param {Response} response
 */
async function gatherResponse(response) {
  const { headers } = response;
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return JSON.stringify(await response.json());
  } else if (contentType.includes("application/text")) {
    return await response.text();
  } else if (contentType.includes("text/html")) {
    return await response.text();
  } else {
    return await response.text();
  }
}
