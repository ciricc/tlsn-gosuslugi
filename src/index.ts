import icon from '../assets/icon.png';
import config_json from '../config.json';

import { redirect, notarize, outputJSON, getCookiesByHost, getHeadersByHost } from './utils/hf.js';

/**
 * Plugin configuration
 * This configurations defines the plugin, most importantly:
 *  * the different steps
 *  * the user data (headers, cookies) it will access
 *  * the web requests it will query (or notarize)
 */
export function config() {
  outputJSON({
    ...config_json,
    icon: icon
  });
}

function isValidHost(urlString: string) {
  const url = new URL(urlString);
  return url.hostname === 'lk.gosuslugi.ru';
}

/**
 * Implementation of the first (start) plugin step
  */
export function start() {
  if (!isValidHost(Config.get('tabUrl'))) {
    redirect('https://lk.gosuslugi.ru');
    outputJSON(false);
    return;
  }
  outputJSON(true);
}

export function getIdDoc() {
  const cookies = getCookiesByHost('esia.gosuslugi.ru');

  if (!Object.keys(cookies).length) {
    outputJSON(false);
    return
  }

  const cookieHeader = Object.keys(cookies).map(key => `${key}=${cookies[key]}`).join('; ');

  const userId = cookies['u'];
  if (!userId) {
    console.error("Didnt found the user identifier")
    outputJSON(false)
    return
  }

  return outputJSON({
    url: `https://esia.gosuslugi.ru/esia-rs/api/public/v5/prns/${userId}?embed=(documents)`,
    method: "GET",
    headers: {
      'cookie': cookieHeader,
      'origin': "https://lk.gosuslugi.ru",
      "referer": "https://lk.gosuslugi.ru/",
      "content-type": "application/json",
      "accept-language": "en",
      "accept": "application/json",
      "accept-charset": "utf-8",
      "accept-encoding": "identity",
    },
    secretHeaders: [
      'cookie: ' + cookieHeader
    ]
  });
}

export function parseEsiaResponse() {
  const bodyString = Host.inputString();
  const idDoc = JSON.parse(bodyString);

  const reveals = [
    `"birthDate":"${idDoc.birthDate}"`,
    `"firstName":"${idDoc.firstName}"`,
  ];

  if (idDoc.trusted) {
    reveals.push(`"trusted":${idDoc.trusted}`);
  }

  // All not revealed substrings
  let secretResps = [];

  const revealRanges = reveals.map(reveal => {
    const start = bodyString.indexOf(reveal)
    if (start === -1) {
      return null
    }

    return {
      start: start,
      end: start + reveal.length
    }
  }).filter(v => !!v).sort(e => {
    return e.start
  }).sort((a, b) => {
    return a.start - b.start
  })

  // All strings not in the reveal ranges are hidden
  // and pushed to the secretResps
  // Just need to get FULL string in not ranges
  let cursor = 0;

  for (let i = 0; i < revealRanges.length; i++) {
    const range = revealRanges[i];
    const substr = bodyString.substring(cursor, range.start);
    secretResps.push(substr);
    cursor = range.end;
  }

  const substr = bodyString.substring(cursor);
  if (substr) {
    secretResps.push(substr);
  }


  secretResps = secretResps.filter(v => !!v);
  outputJSON(secretResps);
}

/**
 * Step 3: calls the `notarize` host function
 */
export function notarizeIdDoc() {
  const params = JSON.parse(Host.inputString());

  if (!params) {
    outputJSON(false);
  } else {
    const id = notarize({
      ...params,
      getSecretResponse: 'parseEsiaResponse',
    });
    outputJSON(id);
  }
}
