/**
 * - Run `npm run dev-api` in the terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see worker in action
 * - Run `npm run deploy-api` to publish worker
 */

const { Router } = require("itty-router");

const privateSaleMerkle = require("../data/results/merkleAllowlists/community.json");
const discountMerkle = require("../data/results/merkleAllowlists/fans.json");
const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");

// Create a new router
const router = Router();

/*
router.get("/deployment/:network", ({ params: { network } }) => {
  let data = {};
  try {
    data = require(`../data/results/deployment/${network}.json`);
  } catch (e) {
    // send nothing
  }

  const json = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: {
      "content-type": "application/json;charset=UTF-8"
    }
  });
});
*/

router.get(
  "/merkleproofs/rewards/:metadataId",
  ({ params: { metadataId } }) => {
    const { bufaPerDay, merkleProofs } = bufaMerkle[metadataId]
      ? bufaMerkle[metadataId]
      : { bufaPerDay: null, merkleProofs: null };

    const data = {
      metadataId,
      bufaPerDay,
      merkleProofs
    };

    const json = JSON.stringify(data, null, 2);

    return new Response(json, {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    });
  }
);

router.get("/merkleproofs/:addr", ({ params: { addr } }) => {
  addr = addr.toLocaleLowerCase();

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
      "content-type": "application/json;charset=UTF-8"
    }
  });
});

router.all("*", () => new Response("404, not found!", { status: 404 }));

addEventListener("fetch", (event) => {
  event.respondWith(router.handle(event.request));
});
