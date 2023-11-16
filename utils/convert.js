function datocmsIdToUint256(id, computedId) {
  return isNumeric(id) ? id : computedId;
}

function isNumeric(str) {
  return /^[0-9]+$/.test(str);
}

module.exports = {
  datocmsIdToUint256,
  isNumeric
};
