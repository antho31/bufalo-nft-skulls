const { unstable_dev } = require("wrangler");

const privateSaleMerkle = require("../data/results/merkleAllowlists/community.json");
const discountMerkle = require("../data/results/merkleAllowlists/fans.json");
const polygonDeployment = require("../data/results/deployment/polygon.json");

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

  it("should return deployment info for valid network", async () => {
    const network = "polygon";
    const resp = await worker.fetch(`/deployment/${network}`);
    const jsonData = await resp.json();

    expect(resp.status).toBe(200);

    expect(jsonData).toStrictEqual(polygonDeployment);
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
});
