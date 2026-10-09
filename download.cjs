const fs = require('fs');
const https = require('https');
const path = require('path');

const queries = [
  { id: 1, file: 'biogesic.jpg', query: 'Biogesic Paracetamol 500mg Unilab box' },
  { id: 2, file: 'medicol.jpg', query: 'Medicol Advance Ibuprofen 400mg Unilab' },
  { id: 3, file: 'alaxan.jpg', query: 'Alaxan FR Ibuprofen Paracetamol capsule' },
  { id: 4, file: 'ponstan.jpg', query: 'Ponstan Mefenamic Acid 500mg Pfizer' },
  { id: 5, file: 'amoxil.jpg', query: 'Amoxil Amoxicillin 500mg GSK capsule' },
  { id: 6, file: 'augmentin.jpg', query: 'Augmentin 625mg GSK' },
  { id: 7, file: 'zithromax.jpg', query: 'Zithromax Azithromycin 500mg Pfizer' },
  { id: 8, file: 'cravit.jpg', query: 'Cravit Levofloxacin 500mg tablet' },
  { id: 9, file: 'allerta.jpg', query: 'Allerta 10mg Unilab' },
  { id: 10, file: 'claritin.jpg', query: 'Claritin Loratadine 10mg Bayer' },
  { id: 11, file: 'bioflu.jpg', query: 'Bioflu Unilab tablet' },
  { id: 12, file: 'enervon.jpg', query: 'Enervon-C Unilab' },
  { id: 13, file: 'potencee.jpg', query: 'Poten-Cee Ascorbic Acid 500mg Unilab' },
  { id: 14, file: 'centrum.jpg', query: 'Centrum Advance multivitamin Pfizer' },
  { id: 15, file: 'stresstabs.jpg', query: 'Stresstabs Vitamin B Complex Pfizer' },
  { id: 16, file: 'neozep.jpg', query: 'Neozep Forte Unilab tablet' },
  { id: 17, file: 'robitussin.jpg', query: 'Robitussin syrup Pfizer' },
  { id: 18, file: 'solmux.jpg', query: 'Solmux Carbocisteine 500mg Unilab' },
  { id: 19, file: 'tuseran.jpg', query: 'Tuseran Forte capsule Unilab' },
  { id: 20, file: 'kremils.jpg', query: 'Kremil-S Unilab tablet' },
  { id: 21, file: 'gaviscon.jpg', query: 'Gaviscon Reckitt liquid sachet' },
  { id: 22, file: 'omepron.jpg', query: 'Omepron 20mg Unilab capsule' },
  { id: 23, file: 'betadine.jpg', query: 'Betadine 10% solution Mundipharma' },
  { id: 24, file: 'greencross.jpg', query: 'Green Cross Ethyl Alcohol 70% 500ml' },
  { id: 25, file: 'canesten.jpg', query: 'Canesten 1% Clotrimazole cream Bayer' },
  { id: 26, file: 'lamisil.jpg', query: 'Lamisil Terbinafine 250mg Novartis' },
  { id: 27, file: 'diatabs.jpg', query: 'Diatabs Loperamide 2mg Unilab' },
  { id: 28, file: 'imodium.jpg', query: 'Imodium Loperamide 2mg capsule' },
  { id: 29, file: 'norvasc.jpg', query: 'Norvasc Amlodipine 5mg Pfizer' },
  { id: 30, file: 'comicardis.jpg', query: 'Micardis Plus 40mg/12.5mg Boehringer' },
  { id: 31, file: 'alerta.jpg', query: 'Allerta Loratadine 10mg Unilab' },
  { id: 32, file: 'neozep-nondrowsy.jpg', query: 'Neozep Non-Drowsy Phenylephrine Paracetamol Unilab' },
  { id: 33, file: 'tempra.jpg', query: 'Tempra Paracetamol 100mg/mL oral drops Taisho' }
];

const outDir = 'C:\\2nd Backup\\medistock-frontend\\medistock-frontend\\public\\images\\medicines';
fs.mkdirSync(outDir, { recursive: true });

async function searchYahooImages(query) {
  const url = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Yahoo images are embedded in JSON in data-req="...url..." or inside a script tag
        const match = data.match(/imgurl=&quot;(http[^&]+)&quot;/i) || data.match(/"imgurl":"(http[^"]+)"/i);
        if (match) {
          resolve(match[1].replace(/\\/g, ''));
        } else {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filename).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return resolve(false);
      }
      const file = fs.createWriteStream(filename);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', (e) => {
      resolve(false);
    });
  });
}

async function run() {
  for (const item of queries) {
    console.log(`Searching for ${item.query}...`);
    try {
      const url = await searchYahooImages(item.query);
      if (url) {
        console.log(`Found: ${url}`);
        const success = await downloadImage(url, path.join(outDir, item.file));
        console.log(success ? 'Downloaded' : 'Failed to download');
      } else {
        console.log('No image found');
      }
    } catch (e) {
      console.log('Error', e.message);
    }
  }
}

run();
