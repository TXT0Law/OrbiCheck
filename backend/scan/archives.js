import { http as axios } from './_common/http.js';
import middleware from './_common/middleware.js';

const convertTimestampToDate = (timestamp) => {
  const [year, month, day, hour, minute, second] = [
    timestamp.slice(0, 4),
    timestamp.slice(4, 6) - 1,
    timestamp.slice(6, 8),
    timestamp.slice(8, 10),
    timestamp.slice(10, 12),
    timestamp.slice(12, 14),
  ].map(num => parseInt(num, 10));

  return new Date(year, month, day, hour, minute, second);
}

const countPageChanges = (results) => {
  let prevDigest = null;
  return results.reduce((acc, curr) => {
    if (curr[2] !== prevDigest) {
      prevDigest = curr[2];
      return acc + 1;
    }
    return acc;
  }, -1);
}

const getAveragePageSize = (scans) => {
    const totalSize = scans.map(scan => parseInt(scan[3], 10)).reduce((sum, size) => sum + size, 0);
    return Math.round(totalSize / scans.length);
};

const getScanFrequency = (firstScan, lastScan, totalScans, changeCount) => {
  const formatToTwoDecimal = num => parseFloat(num.toFixed(2));

  const dayFactor = (lastScan - firstScan) / (1000 * 60 * 60 * 24);

  // P2-5: guard against divide-by-zero. When the wayback history contains
  // a single scan (or several scans captured at the exact same instant),
  // `dayFactor` is 0 and the derived per-day metrics become Infinity/NaN
  // which serialises to invalid JSON and broke the frontend table. Return
  // null in those cases so the UI can render "—" instead.
  if (!Number.isFinite(dayFactor) || dayFactor <= 0) {
    return {
      daysBetweenScans: null,
      daysBetweenChanges: null,
      scansPerDay: null,
      changesPerDay: null,
    };
  }

  return {
    daysBetweenScans: totalScans > 0
      ? formatToTwoDecimal(dayFactor / totalScans)
      : null,
    daysBetweenChanges: changeCount > 0
      ? formatToTwoDecimal(dayFactor / changeCount)
      : null,
    scansPerDay: formatToTwoDecimal((totalScans - 1) / dayFactor),
    changesPerDay: formatToTwoDecimal(changeCount / dayFactor),
  };
};

/**
 * Scan module: Wayback Machine archive history (snapshot count, frequency,
 * average page size). See `_common/types.js` for the inner-handler shape.
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<{firstScan?: string, lastScan?: string, totalScans: number,
 *   changeCount?: number, scanFrequency?: object|null, averagePageSize?: number,
 *   scans?: any, scanUrl?: string, error?: string, skipped?: string}>}
 */
const wayBackHandler = async (url) => {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${url}&output=json&fl=timestamp,statuscode,digest,length,offset`;

  try {
    const { data } = await axios.get(cdxUrl);
    
    // Check there's data
    if (!data || !Array.isArray(data) || data.length <= 1) {
      return { skipped: 'Site has never before been archived via the Wayback Machine' };
    }

    // Remove the header row
    data.shift();

    // Process and return the results
    const firstScan = convertTimestampToDate(data[0][0]);
    const lastScan = convertTimestampToDate(data[data.length - 1][0]);
    const totalScans = data.length;
    const changeCount = countPageChanges(data);
    return {
      firstScan,
      lastScan,
      totalScans,
      changeCount,
      averagePageSize: getAveragePageSize(data),
      scanFrequency: getScanFrequency(firstScan, lastScan, totalScans, changeCount),
      scans: data,
      scanUrl: url,
    };
  } catch (err) {
    return { error: `Error fetching Wayback data: ${err.message}` };
  }
};

export const handler = middleware(wayBackHandler);
export default handler;
