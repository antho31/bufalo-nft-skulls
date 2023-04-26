/**
 * - Run `npm run dev-api` in the terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see worker in action
 * - Run `npm run deploy-api` to publish worker
 */
const envs = require("../env.json");
const { Router } = require("itty-router");
const { Network } = require("alchemy-sdk");

const ethers = require("ethers");
const { parseUnits, keccak256, toUtf8Bytes } = require("ethers/lib/utils");

// const privateSaleMerkle = require("../data/results/merkleAllowlists/community.json");
const discountMerkle = require("../data/results/merkleAllowlists/fans.json");
const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");
// const rarities = require("../data/results/metadata/BOTV/rarities.json");

const mumbaiDeployment = require(`../data/results/deployment/mumbai.json`);
const polygonDeployment = require(`../data/results/deployment/polygon.json`);

const bufaMusicABI = require("../abis/BUFAMUSIC.json");

const { BigNumber } = ethers;

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

router.post("/musicnftmetadataupdate", async (req) => {
  try {
    const {
      DEPLOYER_PRIVATE_KEY,
      POLYGON_MAINNET_RPC_PROVIDER
      // POLYGON_MUMBAI_RPC_PROVIDER
    } = envs;

    const authHash = keccak256(toUtf8Bytes(req.headers.get("Authorization")));

    const authOK =
      authHash ===
      "0xcc97f88dd05fe985eef6cb109a514b3c783fb790a74b7abb7a18b3ae54bcfa54";

    if (authOK) {
      const {
        event_type,
        entity: {
          id,
          attributes: { song_title, iswc, supply, bufa_price, mint_active }
        },
        previous_entity
      } = await req.json();

      const { MusicContractAddress } = polygonDeployment;
      const provider = new ethers.providers.JsonRpcProvider({
        url: POLYGON_MAINNET_RPC_PROVIDER,
        skipFetchSetup: true
      });

      const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
      const contract = new ethers.Contract(
        MusicContractAddress,
        bufaMusicABI,
        wallet
      );

      if (
        event_type === "update" &&
        previous_entity.attributes.song_title === song_title &&
        previous_entity.attributes.iswc === iswc &&
        previous_entity.attributes.supply === supply &&
        previous_entity.attributes.bufa_price === bufa_price &&
        previous_entity.attributes.mint_active === mint_active
      ) {
        return new Response("update without contract call", { status: 200 });
      } else {
        const res = await contract.updateTokenParameter(
          id,
          song_title,
          iswc,
          supply,
          parseUnits(bufa_price.toString(), "ether").toString(),
          event_type === "delete" ? false : mint_active,
          true,
          {
            gasPrice: ethers.utils.parseUnits("1000", "gwei").toString(),
            gasLimit: 501993
          }
        );

        console.log(`contract call for ${event_type} OK`, res);

        return new Response(event_type, { status: 201 });
      }
    } else {
      return new Response(
        `Unauthenticated : ${req.headers.get("Authorization")}`,
        {
          status: 403
        }
      );
    }
  } catch (e) {
    console.error("error in POST : ", e);
    return new Response(e, { status: 500 });
  }
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
            depositDate
            genre
            origin
            visualArt
            commercialRights
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
        //  depositDate,
        genre,
        origin,
        visualArt,
        commercialRights
      } = dataForToken;

      const metadata = {
        attributes: [
          {
            trait_type: "ISWC",
            value: iswc
          },
          {
            trait_type: "Genre",
            value: genre
          },
          {
            trait_type: "Visual Art",
            value: visualArt
          },
          {
            trait_type: "Commercial Rights",
            value: commercialRights
          },

          {
            trait_type: "Origin",
            value: origin
          }
        ],
        animation_url: audioUrl,
        description: `${description}`,
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
      return new Response("404, musicnftmetadata/:tokenId not found!", {
        status: 404
      });
    }
  } catch (e) {
    return new Response(e, { status: 500 });
  }
});

router.get("/musicnfts", async () => {
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
          allMusicNfts {
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
            depositDate
            genre
            origin
            visualArt
            commercialRights
          }
        }`
      })
    });
    res = await res.json();
    const {
      data: { allMusicNfts }
    } = res;

    if (allMusicNfts) {
      const json = JSON.stringify(allMusicNfts, null, 2);

      return new Response(json, {
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } else {
      return new Response("404, no music nfts fetched", { status: 404 });
    }
  } catch (e) {
    return new Response(e, { status: 500 });
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
        return new Response(e, { status: 500 });
      }
    } else {
      return new Response("404, network/addr not found!", { status: 404 });
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
