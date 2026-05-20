const HTTP_451_MESSAGE = 'The playlist provider refused the request with HTTP 451. This may be caused by region/provider restrictions, authentication, user-agent requirements, rate limits, or access policy.';

function buildHttpStatusError(status) {
  const err = new Error('HTTP ' + status);
  err.httpStatus = status;
  err.userMessage = status === 451 ? HTTP_451_MESSAGE : null;
  return err;
}

function getPlaylistFetchErrorMessage(err, prefix) {
  const basePrefix = prefix || 'Could not fetch URL:';
  if (err && err.httpStatus === 451) {
    return `${basePrefix} ${HTTP_451_MESSAGE}`;
  }
  return `${basePrefix} ${(err && err.message) || 'Unknown error'}`;
}

module.exports = {
  HTTP_451_MESSAGE,
  buildHttpStatusError,
  getPlaylistFetchErrorMessage,
};
