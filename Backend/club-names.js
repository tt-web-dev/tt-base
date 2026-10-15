// Manual club_id -> club name map for the MVP club picker.
//
// Upstream myTT JSON carries only club_id + team names (verified on
// 2026-10-15: club-teams endpoint, league schedule and meeting live payload
// have no club-name field), so real opponent club names are maintained here
// by hand. Small set: our leagues involve a few dozen clubs.
//
// Add new clubs as they appear in the Advanced-MVP club modal (club_id is
// shown next to the fallback label until mapped). Unknown ids fall back to
// the representative team name seen that week - the UI never blocks on a
// missing name.
const CLUB_NAMES = {
  '22107': 'TSV Bonn rrh.',
  '22636': 'ESV Troisdorf',
  '22605': 'Meckenheimer SV',
  '22622': 'DJK Eintracht Eitorf',
  '22625': 'HSG Siebengebirge-Thomasberg',
  '22626': 'TTG Niederkassel',
  '22631': 'TTC DJK Hennef',
  '22633': 'ASV St. Augustin',
  '22108': 'TuS Oberkassel',
  '22516': 'TTV Euskirchen',
  '22102': 'TTF Lengsdorf',
  '22103': 'SC Fortuna Bonn',
  '22507': 'TTC Vernich',
  '22105': 'TTC Bonn-Duisdorf',
  '22635': 'TTC BW Siegburg',
  '22627': 'TuS Niederpleis',
  '22620': 'SV Oelinghoven',
  '22608': 'TTF Bad Honnef',
  '22115': 'TV Geislar',
  '22114': 'SV Vilich-Müldorf',
  '22110': 'SV Ennert',
  '22117': 'TTC Plittersdorf',
  '22612': 'TuS Dollendorf',
  '22637': 'TTC Troisdorf',
  '22113': 'TTC Bad Godesberg-Muffendorf',
  '22648': 'SSV Happerschoß',
  '22624': 'SV Lohmar',
  '22119': 'FC RW Lessenich',
  '22618': 'SV BW Oedekoven',
  '22619': 'TTC BR Uedorf',
  '22519': 'TuS Chlodwig Zülpich',
  '22112': 'DJK BW Friesdorf',
  '22106': 'SSF Bonn',
  '22646': 'SG DJK Siegburg',
  '22639': 'TV Bergheim',
  '22649': 'TTC Eschmar',
  '22116': 'BSV Roleber',
  '22101': 'CTTF Bonn',
  '22111': 'TTV Viktoria Bonn',
  '22104': 'ESV BR Bonn'
};

function clubNameFor(clubId, fallback) {
  const id = clubId != null ? String(clubId) : '';
  if (id && CLUB_NAMES[id]) return CLUB_NAMES[id];
  const fb = String(fallback || '').trim();
  return fb ? `${fb} (${id || '?'})` : (id || '?');
}

module.exports = { CLUB_NAMES, clubNameFor };
