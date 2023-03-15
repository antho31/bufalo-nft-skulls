const { unstable_dev } = require("wrangler");

const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");

const discountMerkle = require("../data/results/merkleAllowlists/fans.json");
const privateSaleMerkle = require("../data/results/merkleAllowlists/community.json");

describe("Worker", () => {
  let worker;

  beforeAll(async () => {
    worker = await unstable_dev("api/index.js", {
      experimental: { disableExperimentalWarning: true }
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  it("should return 404 for unimplemented route", async () => {
    const resp = await worker.fetch(`/test`);

    expect(resp.status).toBe(404);
  });

  /*
  it("should return deployment info for valid network", async () => {
    const network = "polygon";
    const resp = await worker.fetch(`/deployment/${network}`);
    const jsonData = await resp.json();

    expect(resp.status).toBe(200);

    expect(jsonData).toStrictEqual(require("../data/results/deployment/polygon.json"));
  });

  it("should return empty deployment info for invalid network", async () => {
    for (let network of [
      "mainnet",
      "goerli",
      "137",
      "0x0000000000000000000000000000000000000000"
    ]) {
      const resp = await worker.fetch(`/deployment/${network}`);
      const jsonData = await resp.json();

      expect(resp.status).toBe(200);

      expect(jsonData).toStrictEqual({});
    }
  });
*/

  it("should return merkle proofs for valid address", async () => {
    const addr =
      "0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA".toLocaleLowerCase();
    const resp = await worker.fetch(`/merkleproofs/${addr}`);
    const jsonData = await resp.json();

    expect(resp.status).toBe(200);

    expect(jsonData).toStrictEqual({
      addr: addr,
      privateSaleMerkleProof: privateSaleMerkle[addr]
        ? privateSaleMerkle[addr]
        : [],
      discountMerkleProof: discountMerkle[addr] ? discountMerkle[addr] : []
    });
  });

  it("should return empty merkle proofs for invalid addresses", async () => {
    for (let addr of [
      "test",
      "0x000000000000000000000000000000000000dEaD",
      "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "0x0000000000000000000000000000000000000000"
    ]) {
      addr = addr.toLocaleLowerCase();
      const resp = await worker.fetch(`/merkleproofs/${addr}`);
      const jsonData = await resp.json();

      expect(resp.status).toBe(200);

      expect(jsonData).toStrictEqual({
        addr: addr,
        privateSaleMerkleProof: [],
        discountMerkleProof: []
      });
    }
  });

  it("should return merkle proofs for valid metadataId", async () => {
    const metadataId = "15";
    const resp = await worker.fetch(`/merkleproofs/rewards/${metadataId}`);
    const jsonData = await resp.json();

    expect(resp.status).toBe(200);

    const { bufaPerDay, merkleProofs } = bufaMerkle[metadataId];

    expect(jsonData).toStrictEqual({
      error: false,
      invalidIds: [],
      metadataIds: [metadataId],
      rewardsPerDay: [bufaPerDay],
      rewardsProofs: [merkleProofs]
    });
  });

  it("should return merkle proofs for valid metadataIds", async () => {
    const metadataIds = "1,45,999";
    const resp = await worker.fetch(`/merkleproofs/rewards/${metadataIds}`);
    const jsonData = await resp.json();

    expect(resp.status).toBe(200);

    expect(jsonData).toStrictEqual({
      error: false,
      invalidIds: [],
      metadataIds: ["1", "45", "999"],
      rewardsPerDay: [400, 50, 75],
      rewardsProofs: [
        bufaMerkle["1"].merkleProofs,
        bufaMerkle["45"].merkleProofs,
        bufaMerkle["999"].merkleProofs
      ]
    });
  });

  it("should return empty merkle proofs for invalid metadataId", async () => {
    const metadataIds =
      "string,85,0x0000000000000000000000000000000000000000,5000";
    const resp = await worker.fetch(`/merkleproofs/rewards/${metadataIds}`);
    const jsonData = await resp.json();

    expect(resp.status).toBe(200);

    expect(jsonData).toStrictEqual({
      error: true,
      invalidIds: [
        "string",
        "0x0000000000000000000000000000000000000000",
        "5000"
      ],
      metadataIds: [
        "string",
        "85",
        "0x0000000000000000000000000000000000000000",
        "5000"
      ],
      rewardsPerDay: [null, 50, null, null],
      rewardsProofs: [null, bufaMerkle["85"].merkleProofs, null, null]
    });
  });
});
