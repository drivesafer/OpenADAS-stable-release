/*
 * VMap Naming Assistant — rule engine v1.0
 * Detects contributions that break P-03 (Place Naming) and A-02 (Address Naming)
 * and proposes a corrected value. Error codes follow "Các bài toán cho Dữ liệu bản đồ"
 * (problem id + sub-type, e.g. P3.2 = P3 kiểu 2).
 *
 * Every finding: {code, field, msg, level, severity}
 *   level: 'L3' = biến đổi xác định, tự áp được (chỉ đổi cách viết)
 *          'L1' = đề xuất, người dùng xác nhận (có thể đổi nghĩa)
 *          'L0' = chỉ gắn cờ, không có đề xuất
 *   severity: 'error' | 'warn'
 * Works in browser (window.NamingEngine) and Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  const nfc = s => (s == null ? '' : String(s)).normalize('NFC');
  const squash = s => s.replace(/[ \t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  // memoised: the same short strings (prefixes, district names, brand keys) are normalised thousands of times
  const memo = (fn, cap) => { const m = new Map(); return s => { s = s == null ? '' : String(s); let v = m.get(s); if (v === undefined) { if (m.size > cap) m.clear(); v = fn(s); m.set(s, v); } return v; }; };
  const strip = memo(s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'), 20000);
  const key = memo(s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), 20000);
  const VN_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
  const isUpperWord = w => /\p{L}/u.test(w) && w === w.toUpperCase() && w !== w.toLowerCase();
  const isLowerWord = w => /^\p{Ll}/u.test(w);
  const cap = w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ---------- learned data (built by train/learn.py; empty = rules only) ----------
  const LEARNED = /*__LEARNED__*/{}/*__END__*/;
  const L_LEAD_OK = new Set(LEARNED.lead_ok || []);
  const L_STREETS = LEARNED.streets || {};
  const L_NON_STREETS = LEARNED.non_streets || {};
  const L_WARDS = new Set(LEARNED.wards || []);
  const L_GENERIC = new Set(LEARNED.generic_names || []);
  const L_PLACES = new Set(LEARNED.places || []);
  const L_DESC = new Set(LEARNED.desc_words || []);
  const L_ACCENT = LEARNED.accent || {};
  const ENGLISH = new Set(['the','and','of','coffee','house','store','shop','hotel','international','spa','beauty','salon','restaurant','bar','club','studio','center','centre','mart','tea','cafe','home','school','academy','fitness','gym','kids','garden','park','city','tower','plaza','mall','airport','station','office','bank','group','company','service','pet','car','auto','motor','food','kitchen','bistro','pizza','sushi','bbq']);

  // ---------- region ----------
  const NORTH = ['ha noi', 'hai phong', 'bac ninh', 'hung yen', 'quang ninh', 'phu tho', 'tuyen quang', 'ninh binh',
    'thai nguyen', 'lang son', 'lao cai', 'dien bien', 'lai chau', 'son la', 'cao bang', 'bac giang', 'vinh phuc',
    'hai duong', 'thai binh', 'nam dinh', 'ha nam', 'hoa binh', 'yen bai', 'ha giang', 'bac kan'];
  const SOUTH = ['ho chi minh', 'dong nai', 'tay ninh', 'vinh long', 'can tho', 'an giang', 'ca mau', 'dong thap',
    'binh duong', 'ba ria', 'long an', 'tien giang', 'ben tre', 'tra vinh', 'soc trang', 'bac lieu', 'kien giang', 'hau giang', 'binh phuoc'];
  function regionOf(province) {
    const k = key(province || '');
    if (!k) return 'Bac';
    if (NORTH.some(p => k.includes(p))) return 'Bac';
    if (SOUTH.some(p => k.includes(p))) return 'Nam';
    return 'Trung';
  }

  // ---------- dictionaries ----------
  // Brand canonical spellings (P3.6 / P4)
  const BRANDS = ['VietinBank', 'VPBank', 'Vietcombank', 'Techcombank', 'BIDV', 'Agribank', 'MB', 'TPBank', 'ACB', 'Sacombank',
    'HDBank', 'SHB', 'VIB', 'OCB', 'SeABank', 'MSB', 'Shinhan Bank', 'Woori Bank', 'LPBank', 'Nam A Bank',
    'WinMart+', 'WinMart', 'Circle K', 'GS25', 'FamilyMart', 'Ministop', '7-Eleven', 'Bách hoá XANH', 'Co.opmart', 'Co.op Food',
    'AEON', 'AEON Mall', 'Lotte Mart', 'MM Mega Market', 'GO!', 'K Market', 'TH true mart', 'Big C',
    'Highlands Coffee', 'Starbucks', 'Phúc Long', 'The Coffee House', 'Katinat', 'Cộng Cà Phê', 'Trung Nguyên Legend', 'Cheese Coffee',
    'Gong Cha', 'Mixue', 'Tocotoco', 'Ding Tea', 'KOI Thé', 'Phê La', 'Ông Bầu',
    'KFC', 'Lotteria', "McDonald's", 'Jollibee', 'Pizza Hut', "Domino's Pizza", "Pizza 4P's", 'Texas Chicken', 'Popeyes', 'Burger King', 'Subway',
    'Kichi-Kichi', 'GoGi House', 'Manwah', 'Haidilao', 'Sumo BBQ', 'King BBQ', 'Phở 24', 'Tous les Jours', 'Paris Baguette', 'ABC Bakery',
    'Pharmacity', 'Long Châu', 'An Khang', 'Guardian', 'Hasaki', 'Medicare',
    'Thế Giới Di Động', 'Điện máy XANH', 'FPT Shop', 'CellphoneS', 'Hoàng Hà Mobile', 'Phong Vũ', 'GearVN', 'Viettel Store',
    'CGV', 'Lotte Cinema', 'BHD Star', 'Galaxy Cinema', 'Beta Cinemas', 'Karaoke ICOOL',
    'Vincom', 'Vincom Center', 'Vincom Plaza', 'Vincom Mega Mall', 'Vinhomes', 'Vinmec', 'Vinschool', 'VinUni', 'VinFast',
    'Petrolimex', 'PV Oil', 'Viettel Post', 'GHN', 'J&T Express', 'VNPost', '30Shine', 'Con Cưng', 'Bibo Mart', 'PNJ', 'DOJI',
    'Uniqlo', 'Muji', 'Decathlon', 'Biti\'s', 'Canifa', 'Routine', 'Owen', 'Yody', 'Fahasa', 'Pet Mart', 'Toyota', 'Honda', 'Vinamilk'];
  const BRAND_ALIASES = {
    'vietinbank': 'VietinBank', 'vpbank': 'VPBank', 'vp bank': 'VPBank', 'tpbank': 'TPBank', 'tp bank': 'TPBank', 'mbbank': 'MB', 'mb bank': 'MB',
    'seabank': 'SeABank', 'hdbank': 'HDBank', 'lpbank': 'LPBank', 'shinhan bank': 'Shinhan Bank', 'shinhanbank': 'Shinhan Bank',
    'winmart plus': 'WinMart+', 'winmart+': 'WinMart+', 'vinmart+': 'WinMart+', 'vinmart plus': 'WinMart+', 'winmart': 'WinMart', 'vinmart': 'WinMart',
    'circle k': 'Circle K', 'circlek': 'Circle K', 'gs 25': 'GS25', 'gs25': 'GS25', 'family mart': 'FamilyMart', 'familymart': 'FamilyMart',
    '7 eleven': '7-Eleven', '7eleven': '7-Eleven', 'coopmart': 'Co.opmart', 'co opmart': 'Co.opmart', 'co op mart': 'Co.opmart',
    'aeon mall': 'AEON Mall', 'aeon': 'AEON', 'lotte mart': 'Lotte Mart', 'lottemart': 'Lotte Mart',
    'highland coffee': 'Highlands Coffee', 'highlands coffee': 'Highlands Coffee', 'highland': 'Highlands Coffee', 'highlands': 'Highlands Coffee',
    'starbucks coffee': 'Starbucks Coffee', 'starbucks': 'Starbucks', 'phuc long': 'Phúc Long', 'the coffee house': 'The Coffee House',
    'katinat': 'Katinat', 'cong ca phe': 'Cộng Cà Phê', 'gongcha': 'Gong Cha', 'gong cha': 'Gong Cha', 'mixue': 'Mixue', 'tocotoco': 'Tocotoco',
    'ding tea': 'Ding Tea', 'dingtea': 'Ding Tea', 'koi the': 'KOI Thé', 'phe la': 'Phê La',
    'kfc': 'KFC', 'lotteria': 'Lotteria', 'mcdonald s': "McDonald's", 'mcdonalds': "McDonald's", 'jollibee': 'Jollibee', 'pizza hut': 'Pizza Hut',
    'texas chicken': 'Texas Chicken', 'popeyes': 'Popeyes', 'burger king': 'Burger King',
    'kichi kichi': 'Kichi-Kichi', 'gogi house': 'GoGi House', 'gogi': 'GoGi House', 'manwah': 'Manwah', 'haidilao': 'Haidilao',
    'tous les jours': 'Tous les Jours', 'paris baguette': 'Paris Baguette',
    'pharmacity': 'Pharmacity', 'long chau': 'Long Châu', 'fpt long chau': 'Long Châu', 'an khang': 'An Khang', 'guardian': 'Guardian', 'hasaki': 'Hasaki',
    'the gioi di dong': 'Thế Giới Di Động', 'dien may xanh': 'Điện máy XANH', 'fpt shop': 'FPT Shop', 'cellphones': 'CellphoneS',
    'cgv': 'CGV', 'lotte cinema': 'Lotte Cinema', 'bhd star': 'BHD Star', 'beta cinemas': 'Beta Cinemas', 'beta cinema': 'Beta Cinemas',
    'icool': 'ICOOL', 'karaoke icool': 'Karaoke ICOOL', 'petrolimex': 'Petrolimex', 'viettel post': 'Viettel Post', 'vietel post': 'Viettel Post',
    '30shine': '30Shine', '30 shine': '30Shine', 'con cung': 'Con Cưng', 'pnj': 'PNJ', 'doji': 'DOJI', 'uniqlo': 'Uniqlo', 'muji': 'Muji',
    'decathlon': 'Decathlon', 'fahasa': 'Fahasa', 'pet mart': 'Pet Mart', 'petmart': 'Pet Mart', 'vinmec': 'Vinmec', 'vinschool': 'Vinschool',
    'vincom': 'Vincom', 'vincom center': 'Vincom Center', 'vincom plaza': 'Vincom Plaza', 'vincom mega mall': 'Vincom Mega Mall',
    'techcombank': 'Techcombank', 'vietcombank': 'Vietcombank', 'bidv': 'BIDV', 'agribank': 'Agribank', 'sacombank': 'Sacombank', 'acb': 'ACB',
    'bach hoa xanh': 'Bách hoá XANH', 'canifa': 'Canifa', 'yody': 'Yody', 'phong vu': 'Phong Vũ', 'th true mart': 'TH true mart'
  };
  // brands that are chains (Brand - Branch rule P4.4)
  const CHAINS = new Set(['Starbucks Coffee', 'VietinBank', 'VPBank', 'Vietcombank', 'Techcombank', 'BIDV', 'Agribank', 'MB', 'TPBank', 'ACB', 'Sacombank', 'HDBank',
    'WinMart+', 'WinMart', 'Circle K', 'GS25', 'FamilyMart', 'Ministop', '7-Eleven', 'Bách hoá XANH', 'Co.opmart', 'Lotte Mart', 'K Market',
    'Highlands Coffee', 'Starbucks', 'Phúc Long', 'The Coffee House', 'Katinat', 'Cộng Cà Phê', 'Gong Cha', 'Mixue', 'Tocotoco', 'Ding Tea', 'KOI Thé', 'Phê La',
    'KFC', 'Lotteria', "McDonald's", 'Jollibee', 'Pizza Hut', 'Texas Chicken', 'Popeyes', 'Burger King', 'Kichi-Kichi', 'GoGi House', 'Manwah', 'Haidilao',
    'Tous les Jours', 'Paris Baguette', 'Pharmacity', 'Long Châu', 'An Khang', 'Guardian', 'Hasaki', 'Thế Giới Di Động', 'Điện máy XANH', 'FPT Shop',
    'CellphoneS', 'CGV', 'Lotte Cinema', 'BHD Star', 'Beta Cinemas', 'Karaoke ICOOL', 'Viettel Post', '30Shine', 'Con Cưng', 'PNJ', 'Pet Mart', 'Fahasa', 'TH true mart', 'Vinmec']);
  Object.assign(BRAND_ALIASES, LEARNED.brands || {});
  const ALIAS_KEYS = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);

  // Generic "type" prefixes written in sentence case (P-03 §3–§13)
  const TYPE_PREFIXES = ['Quầy thuốc', 'Đại sứ quán', 'Hợp tác xã', 'Trạm Dừng nghỉ', 'Đại lý vé máy bay', 'Văn phòng Công chứng', 'Ủy ban Nhân dân', 'Viện Nghiên cứu', 'Tòa nhà', 'Toà nhà', 'Sân cầu lông', 'Nội thất', 'Xăng dầu', 'Lớp Mầm non', 'Điểm dán thẻ', 'Trung tâm thương mại', 'Trung tâm Ngoại ngữ', 'Trung tâm Tiệc cưới', 'Trường Mẫu giáo', 'Dịch vụ', 'Bể bơi', 'Cây xăng', 'Trạm xăng', 'Trường Mầm non', 'Trường Tiểu học', 'Trường Đại học', 'Trường Cao đẳng', 'Nhà văn hóa', 'Nhà văn hoá',
    'Thẩm mỹ viện', 'Văn phòng Công chứng', 'Rạp chiếu phim', 'Bãi đỗ xe', 'Bãi giữ xe', 'Khu đô thị', 'Trạm Y tế', 'Sân bóng đá',
    'Nhà hàng', 'Khách sạn', 'Cửa hàng', 'Nhà thuốc', 'Nhà nghỉ', 'Nhà sách', 'Nhà hát', 'Nhà thờ', 'Bệnh viện', 'Phòng khám', 'Công viên',
    'Siêu thị', 'Ngân hàng', 'Tạp hóa', 'Tạp hoá', 'Trạm sạc', 'Trung tâm', 'Văn phòng', 'Công ty', 'Bảo tàng', 'Quảng trường', 'Học viện', 'Chung cư',
    'Tiệm bánh', 'Nha khoa'];
  const TYPE_PREFIX_KEYS = TYPE_PREFIXES.map(p => [key(p), p]).sort((a, b) => b[0].length - a[0].length);
  const SINGLE_TYPE_WORDS = new Set(['quán', 'tiệm', 'chợ', 'chùa', 'đền', 'đình', 'miếu', 'trường', 'viện', 'sân', 'tòa', 'toà', 'ga', 'bến', 'trạm', 'bể', 'hồ', 'phố', 'khu']);
  const LOWER_OK = new Set(['và', 'của', 'tại', 'cho', 'với', '&', 'of', 'the', 'de', 'du', 'la', 'le', 'les', 'by', 'for', 'and', 'x', 'n', 'à', 'by', 'in', 'on', 'to', 'à', 'et', 'des', 'e', 'true', 'mart']);

  // P-03 §12 abbreviations not allowed in canonical name
  const ABBR = [
    [/(?<![\p{L}\d])KS(?![\p{L}\d])/gu, 'Khách sạn'], [/(?<![\p{L}\d])NH(?![\p{L}\d])(?=\s+\p{Lu})/gu, 'Nhà hàng'], [/(?<![\p{L}\d])CF(?![\p{L}\d])/gu, 'Cà phê'], [/(?<![\p{L}\d])CH(?![\p{L}\d])(?=\s)/gu, 'Cửa hàng'], [/(?<![\p{L}\d])BV(?![\p{L}\d])/gu, 'Bệnh viện'],
    [/(?<![\p{L}\d])KĐT(?![\p{L}\d])/gu, 'Khu đô thị'], [/(?<![\p{L}\d])KDT(?![\p{L}\d])/gu, 'Khu đô thị'], [/(?<![\p{L}\d])KDC(?![\p{L}\d])/gu, 'Khu dân cư'], [/(?<![\p{L}\d])KTT(?![\p{L}\d])/gu, 'Khu tập thể'], [/(?<![\p{L}\d])ĐHQG(?![\p{L}\d])/gu, 'Đại học Quốc gia'],
    [/(?<![\p{L}\d])ĐH(?![\p{L}\d])/gu, 'Đại học'], [/(?<![\p{L}\d])CĐ(?![\p{L}\d])/gu, 'Cao đẳng'], [/(?<![\p{L}\d])HV(?![\p{L}\d])(?=\s+\p{Lu})/gu, 'Học viện'], [/(?<![\p{L}\d])[Cc][Tt][Yy](?![\p{L}\d])\.?/gu, 'Công ty'], [/(?<![\p{L}\d])TTDV(?![\p{L}\d])/gu, 'Trung tâm Dịch vụ'],
    [/(?<![\p{L}\d])MN(?![\p{L}\d])(?=\s+\p{Lu})/gu, 'Mầm non'], [/(?<![\p{L}\d])[Cc][Nn](?![\p{L}\d])(?=\s+\p{Lu})/gu, 'Chi nhánh'], [/(?<![\p{L}\d])[Cc][Ss]\s?(?=\d)/gu, 'Cơ sở '], [/(?<![\p{L}\d])TTTM\b(?!\s+(Aeon|AEON|Vincom|Lotte|Go|GO|Big C|Times|Royal|Savico|Mipec|Indochina))/gu, 'Trung tâm thương mại'],
    [/(?<![\p{L}\d])UBND(?![\p{L}\d])/gu, 'Ủy ban nhân dân'], [/(?<![\p{L}\d])CA(?![\p{L}\d])(?=\s+(P|Phường|Xã|Tỉnh|TP|Thành phố))/gu, 'Công an'], [/(?<![\p{L}\d])TAND(?![\p{L}\d])/gu, 'Tòa án Nhân dân'], [/(?<![\p{L}\d])BHXH(?![\p{L}\d])/gu, 'Bảo hiểm Xã hội']
  ];
  const MALLS = /^(TTTM|Trung tâm thương mại)\s+(?=(Aeon|AEON|Vincom|Lotte|Go|GO|Big C|Indochina|Takashimaya|Times|Royal|Savico|Mipec|Diamond))/;

  const CITY_TAIL = /(?:[\s,\x2D–]+)(?:TP\.?\s?HCM|Tp\.?\s?HCM|HCM|HCMC|Sài Gòn|Saigon|Hà Nội|Ha Noi|Hanoi|HN|Việt Nam|Viet ?Nam|Vietnam|VN)\s*$/i;
  const OFFICIAL_START = /^(Đình|Miếu|Lăng|Nhà văn hóa|Nhà văn hoá|Trường|Đại học|Học viện|Bệnh viện|Bảo tàng|Sở|Cục|Ủy ban|Uỷ ban|UBND|Tòa án|Toà án|Bưu điện|Nhà hát|Thư viện|Viện|Công an|Chi cục|Kho bạc|Trung tâm|Sân bay|Ga|Bến xe|Nhà tang lễ|Đại sứ quán|Tổng|Hội|Liên đoàn|Ngân hàng Nhà nước|Khu Di tích|Thảo Cầm Viên|Nhà thờ|Chùa|Đền|Văn phòng)(?![\p{L}])/iu;
  const ADS = /\b(uy tín|giá rẻ|số 1|số một|chất lượng cao|tốt nhất|rẻ nhất|chính hãng|bao đẹp|siêu rẻ|free ?ship|giao hàng tận nơi)\b/i;
  const CHILD_WORDS = /^(Tòa nhà|Toà nhà|Tòa|Toà|Block|Tháp|Sảnh|Cổng|Lối vào|Hầm|Bãi đỗ xe|Bãi gửi xe|Bãi giữ xe|Điểm đón|Phân khu|Park|Khối)(?![\p{L}])/iu;
  const PARENTS = ['AEON Mall Hà Đông', 'Aeon Mall Hà Đông', 'AEON Mall Long Biên', 'Aeon Mall Long Biên', 'Vinhomes Times City', 'Times City', 'Vinhomes Smart City', 'Smart City', 'Vinhomes Ocean Park', 'Ocean Park', 'Royal City',
    'Vinhomes Central Park', 'Landmark 81', 'Keangnam', 'Lumi Hà Nội', 'The Manor', 'Goldmark City', 'Masteri West Heights', 'The Canopy',
    'Vinhomes Gardenia', 'Vinhomes Skylake', 'Vinhomes Green Bay', 'Vinhomes Riverside', 'Ciputra', 'Mandarin Garden', 'Imperia Smart City', 'Sky Lake'];
  for (const p of (LEARNED.parents || [])) if (!PARENTS.includes(p)) PARENTS.push(p);
  PARENTS.sort((a, b) => b.length - a.length);

  const DISTRICTS_OLD = ['Từ Liêm', 'Ba Đình', 'Hoàn Kiếm', 'Đống Đa', 'Hai Bà Trưng', 'Cầu Giấy', 'Thanh Xuân', 'Hoàng Mai', 'Long Biên', 'Tây Hồ',
    'Nam Từ Liêm', 'Bắc Từ Liêm', 'Hà Đông', 'Đông Anh', 'Gia Lâm', 'Thanh Trì', 'Sóc Sơn', 'Mê Linh', 'Hoài Đức', 'Đan Phượng', 'Thạch Thất',
    'Quốc Oai', 'Chương Mỹ', 'Thanh Oai', 'Thường Tín', 'Phú Xuyên', 'Ứng Hòa', 'Mỹ Đức', 'Ba Vì', 'Phúc Thọ', 'Sơn Tây', 'Bình Thạnh', 'Gò Vấp',
    'Tân Bình', 'Tân Phú', 'Phú Nhuận', 'Thủ Đức', 'Bình Tân', 'Nhà Bè', 'Củ Chi', 'Hóc Môn', 'Bình Chánh', 'Cần Giờ'];
  const DIST_TAIL_RE = new RegExp('(?:\\s*,\\s*|\\s+-\\s+|\\s+)(' + DISTRICTS_OLD.map(escRe).join('|') + ')\\s*$', 'u');
  const DISTRICT_RE = new RegExp('(?:^|,\\s*)(?:Q\\.|Quận|Huyện|H\\.)\\s*[\\p{L}\\d ]+|(?:^|,\\s*)(?:' + DISTRICTS_OLD.map(escRe).join('|') + ')\\s*(?=,|$)', 'iu');
  const ADMIN_SEG = /(Hà Nội|Ha Noi|Hanoi|Việt Nam|Viet Nam|Vietnam|Thành phố|TP\.|Tp\.|Hồ Chí Minh|HCM|Phường|Xã|Quận|Huyện|Tỉnh|^P\.?\s|^Q\.?\s|^Hn$|^HN$)/i;
  const POSTCODE = /\b\d{5,6}\b(?=\s*(,|$|Việt|Vietnam|Viet))/;
  const PLUSCODE = /\b[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}\b/;
  const UNIT_RE = /(?<![\p{L}\d])(tầng|tâng|tang|lô|lo|toà|tòa|toa|block|gian hàng|gian|kiot|kiốt|ki-ốt|shophouse|villa|biệt thự|liền kề|lk|căn|phòng|nhà|chung cư|tháp|khu|sh|cc|ct|tt|bt|hh|nv|tk|vl|ô đất|ô|landmark|park)(?![\p{L}])|(?<![\p{L}\d])[A-Za-zĐđ]{1,3}\d+[A-Za-z]?(?:[-.]\d+[A-Za-z]?)*(?![\p{L}\d])|\b\d+[A-Za-z]{1,3}\d+\b|\d+-[A-Za-z]{1,3}\d*\b/iu;
  const AREA_IN_STREET = /(?<![\p{L}])(KĐT|KDT|Khu đô thị|Khu Đô Thị|Khu tập thể|Khu Tập Thể|KTT|Ktt|Chung cư|Toà|Tòa|TTTM|Aeon Mall|AEON Mall|Vincom|Vinhomes|Times City|Smart City|SmartCity|Ocean Park|Royal City|Landmark|Thôn|Xóm|Tổ [Dd]ân [Pp]hố|Tổ \d+|Cụm [Dd]ân [Cc]ư|Cụm công nghiệp|Làng|Hanoi City|Ha Noi|Khu dân cư|Khu Dân Cư|Khu công nghiệp|KCN|Dự án|Lô|Ô đất|Phân khu)(?![\p{L}])/u;
  const STREET_PREFIX = /^(Phố|Đường|Ngõ|Ngách|Hẻm|Kiệt|Quốc lộ|QL|Tỉnh lộ|Đường tỉnh|Đường Tỉnh|Đại lộ|Đê|Cầu|Vành đai|Cao tốc|Ngã|Bờ|Dốc|Vòng xuyến|Hương lộ|Liên tỉnh lộ|Đường huyện|Đường Huyện|Khu|Làng)(?![\p{L}])/u;
  const STREET_TYPOS = { 'nhụê': 'Nhuệ', 'hổ tùng mậu': 'Hồ Tùng Mậu', 'hồ tùng mầu': 'Hồ Tùng Mậu', 'pastuer': 'Pasteur', 'lê quang đại': 'Lê Quang Đạo' };

  // unaccented Vietnamese words → accented (for P3.3 / A6.2)
  const UNACCENT = {
    nha: 'Nhà', hang: 'Hàng', quan: 'Quán', banh: 'Bánh', bun: 'Bún', pho: 'Phở', com: 'Cơm', oto: 'Ô Tô', khach: 'Khách', san: 'Sạn',
    sieu: 'Siêu', thi: 'Thị', tiem: 'Tiệm', thuoc: 'Thuốc', benh: 'Bệnh', vien: 'Viện', truong: 'Trường', cho: 'Chợ', chua: 'Chùa',
    sua: 'Sửa', xe: 'Xe', may: 'Máy', toc: 'Tóc', ngon: 'Ngon', tap: 'Tạp', hoa: 'Hóa', duong: 'Đường', nguyen: 'Nguyễn', tran: 'Trần',
    le: 'Lê', pham: 'Phạm', hoang: 'Hoàng', ca: 'Cà', phe: 'Phê', lau: 'Lẩu', nuong: 'Nướng', ga: 'Gà', vit: 'Vịt', bo: 'Bò', cay: 'Cây', xang: 'Xăng'
  };
  const STRONG_UNACCENT = new Set(['nha', 'quan', 'banh', 'bun', 'oto', 'khach', 'sieu', 'tiem', 'thuoc', 'benh', 'truong', 'sua', 'lau', 'nuong', 'phe', 'duong', 'nguyen', 'xang', 'vit']);

  function titleWord(w, keepUpper) {
    if (!w) return w;
    if (keepUpper && /^[A-ZĐ0-9&+.'’-]{1,4}$/.test(w)) return w;          // acronym like CGV, KFC, BBQ
    if (/\d/.test(w) && !/^\d/.test(w) && w.length <= 6 && isUpperWord(w)) return w; // codes like T3, CT4, B1
    return w.split(/(-)/).map(p => p === '-' ? p : cap(p)).join('');
  }
  const ACRONYMS = new Set(['ATM', 'BBQ', 'CGV', 'KFC', 'BIDV', 'ACB', 'MB', 'PNJ', 'SJC', 'DOJI', 'VIB', 'SHB', 'OCB', 'MSB', 'TNHH', 'THCS', 'THPT', 'UBND', 'GS25',
    'VPBank', 'AEON', 'ICOOL', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'FPT', 'CT', 'TT', 'HH', 'VNVC', 'SPA', 'TV', 'DJ', 'IT', 'XANH', 'ABC', 'BHD', 'GO!', 'K', 'TH', 'MM', 'HQ', 'VIP', 'NFC', 'CN']);

  function applyBrandCase(s) {
    let out = s;
    const k = ' ' + key(out) + ' ';
    for (const a of ALIAS_KEYS) {
      if (!k.includes(' ' + a + ' ')) continue;
      const canon = BRAND_ALIASES[a];
      // build regex on the raw string matching the alias loosely (accent/space/punct-insensitive)
      const parts = a.split(' ').map(t => t.split('').map(ch => {
        const map = { a: '[aàáảãạăằắẳẵặâầấẩẫậAÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ]', e: '[eèéẻẽẹêềếểễệEÈÉẺẼẸÊỀẾỂỄỆ]', i: '[iìíỉĩịIÌÍỈĨỊ]', o: '[oòóỏõọôồốổỗộơờớởỡợOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]',
          u: '[uùúủũụưừứửữựUÙÚỦŨỤƯỪỨỬỮỰ]', y: '[yỳýỷỹỵYỲÝỶỸỴ]', d: '[dđDĐ]' };
        return map[ch] || (/[a-z]/.test(ch) ? '[' + ch + ch.toUpperCase() + ']' : escRe(ch));
      }).join(''));
      const re = new RegExp('(^|[^\\p{L}\\d])(' + parts.join("[\\s'’.\\x2D]*") + ')(\\+)?(?=$|[^\\p{L}\\d])', 'u');
      const m = out.match(re);
      if (m) {
        let found = m[2] + (m[3] || '');
        let rep = canon;
        if (canon === 'WinMart' && m[3]) rep = 'WinMart+';
        if (canon === 'WinMart' && /plus/i.test(found)) rep = 'WinMart+';
        if (found !== rep && !(canon.endsWith('+') && found === canon.slice(0, -1) + '+')) {
          out = out.replace(m[2] + (m[3] || ''), rep);
        }
        return { out, brand: rep, raw: found };
      }
    }
    return { out, brand: null };
  }

  // ===================== NAME =====================
  function checkName(rawName, ctx) {
    ctx = ctx || {};
    const F = []; const add = (code, msg, level, severity) => F.push({ code, field: 'name', msg, level: level || 'L3', severity: severity || 'error' });
    const raw = rawName == null ? '' : String(rawName);
    if (!raw.trim()) { add('P2.1', 'Chưa có tên địa điểm', 'L0'); return { findings: F, fixed: raw }; }
    let s = raw;

    // P3.1 characters
    if (s !== s.normalize('NFC')) add('P3.1', 'Ký tự Unicode tổ hợp (NFD) — chuẩn hoá NFC');
    s = nfc(s);
    if (/Ð/.test(s)) { add('P3.1', 'Dùng chữ "Ð" (eth) thay cho "Đ"'); s = s.replace(/Ð/g, 'Đ'); }
    if (/[\u{1D400}-\u{1D7FF}]/u.test(s)) { add('P3.1', 'Ký tự toán học/kiểu chữ trang trí'); s = s.normalize('NFKC'); }
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}★☆✓✔❤️⭐]/u.test(s)) { add('P3.1', 'Emoji / ký hiệu trang trí trong tên'); s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}★☆✓✔⭐️]/gu, ' '); }
    if (/[@#?*~^_=<>{}\[\]\\]|!{2,}|!\s*$/.test(s)) { add('P3.1', 'Ký tự đặc biệt không dùng trong tên'); s = s.replace(/[@#?*~^_=<>{}\[\]\\]/g, ' ').replace(/!{2,}/g, ' ').replace(/!\s*$/, ''); }
    if (/\S-\s+\S|\S\s+-\S/.test(s) && !/\d\s?-\s?\d/.test(s)) { add('P3.1', 'Gạch nối phải có khoảng trắng hai bên: "A - B"'); s = s.replace(/(\S)-\s+(\S)/g, '$1 - $2').replace(/(\S)\s+-(\S)/g, '$1 - $2'); }
    if (/\s\|\s|\|/.test(s)) { add('P3.1', 'Dùng "|" làm phân tách — dùng " - "'); s = s.replace(/\s*\|\s*/g, ' - '); }
    if (/^\s|\s$| {2,}/.test(s)) add('P3.1', 'Khoảng trắng thừa ở đầu/cuối hoặc liên tiếp');
    s = squash(s);
    s = s.replace(/[’‘`]/g, "'");
    // ATM-Brand
    if (/^ATM\s*[-–]\s*/i.test(s)) { add('P3.1', 'ATM viết theo mẫu "ATM + Ngân hàng"'); s = s.replace(/^ATM\s*[-–]\s*/i, 'ATM '); }
    // hyphen without spaces between words
    const hy = s.match(/(\p{L}{2,})[-–](\p{Lu}\p{L}+)/u);
    if (hy && !/Kichi-Kichi|7-Eleven|Hi-Tech|Wi-Fi|Co-op|K-Pop|E-mart|Ba-Na|T-shirt/i.test(hy[0])) {
      add('P3.1', 'Gạch nối phải có khoảng trắng hai bên: "A - B"'); s = s.replace(/(\p{L}{2,})\s*[-–]\s*(\p{Lu}\p{L}+)/u, '$1 - $2');
    }
    s = s.replace(/\s+[–—]\s+/g, ' - ');
    // comma used as separator
    if ((s.match(/,/g) || []).length >= 2 && !/^\S+\d/.test(s)) { add('P3.5', 'Tên kèm danh sách món/dịch vụ — chỉ giữ tên', 'L1'); s = s.split(/\s*,\s*/)[0]; }
    else if (/,/.test(s)) { add('P3.1', 'Dùng dấu phẩy để phân tách — dùng " - "', 'L1'); s = s.split(/\s*,\s*/).filter(Boolean).join(' - '); }
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(s)) {
      add('P3.1', 'Ký tự Hán/Hàn/Nhật trong tên chính — đưa vào bí danh', 'L1');
      s = squash(s.split(' - ').filter(g => !/^[^\p{Script=Latin}]*$/u.test(g.replace(/[\d\s()（）.-]/g, '')) || !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(g)).join(' - ').replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')).replace(/\s*-\s*$/, '');
    }

    // P3.7 not a name
    const nk = key(s);
    const streetCore = key(ctx.street || '').replace(/^(pho|duong|ngo \d+( pho| duong)?|ngach [\d/]+( pho| duong)?) /, '');
    if (/https?:|www\.|\.com\b|\.vn\b/i.test(s)) add('P3.7', 'Tên chứa URL', 'L1');
    if (/->|=>/.test(s)) add('P3.7', 'Tên còn vết sửa "A -> B"', 'L1');
    if (/^(nhà riêng|nha rieng|nhà|nhà dân|no name|chưa có tên|test)$/i.test(s) || L_GENERIC.has(nk) || CAT_KEYS.has(nk)) add('P3.7', 'Tên chỉ là loại hình chung hoặc không phải tên riêng — nhập tên trên biển hiệu', 'L0');
    if (/^(số\s*)?\d+[A-Za-z]?(\/\d+)*\s+\p{L}/iu.test(s) && streetCore && nk.includes(streetCore)) add('P3.7', 'Tên là địa chỉ (số nhà + tên đường) — cần tên thật trên biển hiệu', 'L0');
    else if (streetCore && nk === streetCore) add('P3.7', 'Tên trùng tên đường', 'L0');

    // P3.4 abbreviations
    let s4 = s;
    if (MALLS.test(s4)) { s4 = s4.replace(MALLS, ''); }
    for (const [re, rep] of ABBR) s4 = s4.replace(re, rep);
    if (s4 !== s) { add('P3.4', 'Viết tắt không dùng trong tên chính (P-03 §12) — đưa vào bí danh', 'L3'); s = s4; }

    // P3.5 extras
    // parenthetical remarks: "(Hà Đông)", "( BIDV )"
    if (/\(.*\)|（.*）/.test(s)) {
      const inner = (s.match(/[（(]\s*([^)）]*?)\s*[)）]/) || [])[1] || '';
      if (/[\u3000-\u9fff\uac00-\ud7af]/.test(inner)) add('P3.1', 'Ký tự Hán/Hàn trong tên chính — đưa vào bí danh', 'L1');
      else add('P3.5', `Phần trong ngoặc "(${inner})" không thuộc tên chính — đưa vào bí danh`, 'L1');
      s = squash(s.replace(/\s*[（(][^)）]*[)）]\s*/g, ' '));
    }
    // floor / mall abbreviations inside name: "Tầng 1 TTTM Aeon Mall"
    if (/(?<![\p{L}])Tầng\s+\w+\s*/iu.test(s) && / - /.test(s)) { add('P3.5', 'Thông tin tầng không đưa vào tên', 'L1'); s = squash(s.replace(/(?<![\p{L}])Tầng\s+\w+\s*/iu, '')); }
    if (/(?<![\p{L}])TTTM\s+(?=(Aeon|AEON|Vincom|Lotte|Go|GO|Big C|Times|Royal|Savico|Mipec|Indochina))/u.test(s)) { add('P3.4', 'Bỏ "TTTM" trước tên TTTM chính thức', 'L3'); s = s.replace(/(?<![\p{L}])TTTM\s+/u, ''); }
    const official = OFFICIAL_START.test(s);
    // city suffix: abbreviations always; full name only after a separator
    const CITY_ABBR = /(?:[\s,\x2D–]+)(TP\.?\s?HCM|Tp\.?\s?HCM|HCM|HCMC|HN|VN)\s*$/;
    const CITY_FULL = /\s*(?:,|\s-\s)\s*(Hà Nội|Ha Noi|Hanoi|Sài Gòn|Saigon|Thành phố Hồ Chí Minh|TP\.? Hồ Chí Minh|Việt Nam|Viet Nam|Vietnam)\s*$/i;
    const CITY_BARE = /\s+(Hà Nội|Ha Noi|Hanoi|Hà nội|Saigon|Việt Nam|Vietnam)\s*$/;
    const GENERIC_HEAD = /^(Quán|Tiệm|Bánh Mì|Bánh mì|Phở|Bún|Chè|Cơm|Xôi|Bảo tàng|Nhà|Hồ|Chợ|Ga|Cafe|Café|Cà Phê|Cà phê)(\s+\p{L}+)?$/iu;
    if (!official && (CITY_ABBR.test(s) || CITY_FULL.test(s))) {
      add('P3.5', 'Thừa hậu tố thành phố ở cuối tên', 'L1');
      s = s.replace(CITY_ABBR, '').replace(CITY_FULL, '').trim();
    } else if (!official && CITY_BARE.test(s)) {
      const head = s.replace(CITY_BARE, '').trim();
      if (head.split(' ').length >= 2 && !GENERIC_HEAD.test(head)) { add('P3.5', 'Thừa hậu tố thành phố ở cuối tên — đưa vào bí danh nếu cần', 'L1'); s = head; }
    }
    const distTail = DIST_TAIL_RE;
    const dm = s.match(distTail);
    if (!official && dm && key(dm[1]) !== streetCore && !/\d/.test(s) && s.replace(distTail, '').trim().split(' ').length >= 2 && !PARENTS.some(p => s.endsWith(p)) && !applyBrandCase(s).brand) {
      add('P3.5', 'Thừa tên quận/huyện cũ ở cuối tên', 'L1'); s = s.replace(distTail, '').trim();
    }
    const ADS2 = /(?<![\p{L}])(uy tín|giá rẻ|giá tốt|tốt nhất|rẻ nhất|chính hãng|siêu rẻ|free ?ship|ship xuyên đêm|xuyên đêm|giao hàng tận nơi|tại nhà|chuyên nghiệp|since \d{4}|24\/7)(?![\p{L}])/iu;
    if (ADS2.test(s)) { add('P3.5', 'Chữ quảng cáo/mô tả dịch vụ không phải tên', 'L1'); s = squash(s.replace(new RegExp(ADS2.source, 'giu'), '')).replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, ''); }
    if (/(?<![\p{L}])Chuyên\s+\p{L}/u.test(s) && s.split(' ').length >= 4 && !/^Chuyên/.test(s)) { add('P3.5', 'Mô tả "Chuyên …" không thuộc tên', 'L1'); s = s.replace(/\s+Chuyên\s+.*$/u, '').trim(); }
    if (/(?:^|\D)0\d{8,10}(?:\D|$)/.test(s.replace(/[\s.]/g, ''))) { add('P3.5', 'Số điện thoại trong tên', 'L1'); s = squash(s.replace(/(\+?84|0)[\d .]{8,12}/g, '')); }
    // descriptive segment after " - " (Yakimono - Nhà hàng nướng Nhật Bản)
    {
      const segs = s.split(' - ');
      const DESC = /^(Nhà hàng|Nhà Hàng|Cửa hàng|Cửa Hàng|Quán|Salon|Tiệm|Cơm|Spa|Đặc sản|Đặc Sản|Chuyên|Shop|Store|Restaurant|Cafe|Cà phê|Cà Phê|Coffee|Bún|Phở|Lẩu|Bánh|Mẹ & Bé|Wellness)(?![\p{L}])/u;
      if (segs.length >= 2 && !official && segs.slice(1).some(g => DESC.test(g) && !/\d/.test(g) && !PARENTS.some(p => g.includes(p))) && !CHILD_WORDS.test(segs[0])) {
        add('P3.5', 'Phân đoạn mô tả loại hình/dịch vụ sau " - " không thuộc tên chính', 'L1');
        s = [segs[0]].concat(segs.slice(1).filter(g => !(DESC.test(g) && !/\d/.test(g)))).join(' - ');
      }
    }
    // learned descriptor lexicon: "Cá Cảnh Thành Trung - Bể Cá Thuỷ Sinh", "Hoàng Gia Auto - Cứu Hộ Sửa Chữa Ôtô Lưu Động"
    if (L_DESC.size && !official && / - /.test(s)) {
      const segs = s.split(' - ');
      const isDesc = g => { const t = key(g).split(' ').filter(Boolean); if (t.length < 2 || /\d/.test(g) || PARENTS.some(p => key(p) === key(g)) || L_PLACES.has(key(g))) return false; return t.filter(x => L_DESC.has(x)).length / t.length >= 0.75; };
      if (segs.length >= 2 && !isDesc(segs[0]) && segs.slice(1).some(isDesc) && !CHILD_WORDS.test(segs[0])) {
        add('P3.5', 'Phân đoạn mô tả sản phẩm/dịch vụ sau " - " không thuộc tên chính', 'L1');
        s = [segs[0]].concat(segs.slice(1).filter(g => !isDesc(g))).join(' - ');
      }
    }
    if (s.split(' - ').length >= 3 && !/\d/.test(s) && !PARENTS.some(p => s.includes(p))) add('P3.5', 'Tên dạng liệt kê/mô tả nhiều phần', 'L0', 'warn');

    // P3.6 brand spelling
    const br = applyBrandCase(s);
    const isAllCapsName = (() => { const L = s.replace(/[^\p{L}]/gu, ''); return L.length >= 4 && L === L.toUpperCase(); })();
    if (br.brand && br.out !== s && !isAllCapsName) { add('P3.6', `Brand viết sai: "${br.raw}" → "${br.brand}"`, 'L3'); s = br.out; }
    else if (br.brand && isAllCapsName) s = br.out;
    const brand = br.brand;

    // P4.4 chain branch without " - " / with house number
    if (brand && CHAINS.has(brand)) {
      const idx = s.indexOf(brand);
      let head = s.slice(0, idx + brand.length);
      let rest = s.slice(idx + brand.length).trim();
      const pre = s.slice(0, idx).trim();
      let changed = false;
      if (pre && /^(Cửa hàng|Cửa Hàng)$/i.test(pre)) { head = brand; changed = true; }
      if (/^(Coffee|Cafe|Café|Tea|Mart|Plus|Bank)\b/i.test(rest) && !/^Coffee\b/.test(rest)) { /* part of brand-ish */ }
      if (/^(ATM|PGD|Phòng giao dịch|LiveBank|Coffee|Cafe|Café|Express|Plus)$/i.test(rest) || (rest && !rest.startsWith('-') && key(rest).split(' ').every(t => ENGLISH.has(t) || L_DESC.has(t) || /^(taiwanese|korean|japanese|thai|chinese|hotpot|bbq|grill|tea|bakery|kitchen|express|mart)$/.test(t)))) { /* brand + service type: keep */ }
      else if (rest && !rest.startsWith('-')) {
        rest = rest.replace(/^(cơ sở|chi nhánh|CN|CS)\s*/i, '').replace(/^(số\s*)?\d+[A-Za-z]?\s+(?=\p{L})/iu, '');
        if (rest && !/^(Coffee|Cafe|Café)$/i.test(rest)) { s = head + ' - ' + rest; changed = true; }
      } else if (rest.startsWith('-')) {
        const r2 = rest.replace(/^-\s*/, '').replace(/^(số\s*)?\d+[A-Za-z]?\s+(?=\p{L})/iu, '');
        if (r2 !== rest.replace(/^-\s*/, '')) { s = head + ' - ' + r2; changed = true; }
        else if (head !== s.slice(0, idx + brand.length)) { s = head + ' - ' + r2; changed = true; }
      } else if (head !== s.slice(0, idx + brand.length)) { s = head; changed = true; }
      if (changed) add('P4.4', 'Chuỗi viết theo mẫu "Brand - Chi nhánh/Địa điểm", bỏ số nhà (P-03 §7)', 'L1');
    } else {
      // house number + street name inside a non-chain name → remove the address part
      const m = s.match(/\s(số\s*)?(\d+[A-Za-z]?)\s+((?:Đường|Phố|P\.|Đ\.)?\s*\p{Lu}[\p{L}]*(?:\s+\p{Lu}[\p{L}]*){0,3})(\s+(HN|Hà Nội))?$/u);
      const tailStreet = m ? key(m[3]).replace(/^(duong|pho|p|d) /, '') : '';
      const headTxt = m ? s.slice(0, m.index).trim() : '';
      const genericHead = m && TYPE_PREFIX_KEYS.concat([['pho', ''], ['gym', ''], ['bun', ''], ['com', ''], ['chung cu mini', ''], ['nha thuoc', ''], ['cafe', ''], ['quan', '']]).some(([k]) => key(headTxt) === k);
      const parentTail = m && (PARENTS.some(p => (m[3] + ' ').includes(p) || p.includes(m[3])) || /^(Times|City|Park|Landmark|Tower|Plaza|Mall)/.test(m[3]));
      if (m && !genericHead && !parentTail && !official && !F.some(f => f.code === 'P3.7') && /\p{L}/u.test(headTxt)) {
        add('P4.4', 'Tên chứa số nhà + tên đường — dạng chuẩn "Tên - Địa điểm/Chi nhánh" (không số nhà)', 'L1');
        s = s.slice(0, m.index).trim() + ' - ' + m[3].replace(/^(Đường|Phố|P\.|Đ\.)\s*/, '').trim();
        void tailStreet;
      } else if (streetCore && streetCore.length >= 4 && !/ - /.test(s) && !official && !(m && genericHead)) {
        const w = s.split(' ');
        const n = streetCore.split(' ').length;
        if (w.length > n && key(w.slice(-n).join(' ')) === streetCore && /^\p{Lu}/u.test(w[w.length - n])) {
          add('P4.4', 'Địa điểm/chi nhánh dính vào tên — dạng chuẩn "Tên - Chi nhánh"', 'L1', 'warn');
          s = w.slice(0, -n).join(' ') + ' - ' + w.slice(-n).join(' ');
        }
      }
      // brand + mall/area without " - ": "Nike Landmark", "Adidas Vincom Center Landmark81", "K-Market Gardenia"
      if (!/ - /.test(s) && !official && !F.some(f => f.code === 'P4.4' || f.code === 'P3.7')) {
        const MALL_TAIL = /\s((?:Vincom(?:\s+(?:Center|Centre|Mega\s+Mall|Plaza))?(?:\s+Landmark\s?\d*)?)|Landmark\s?\d*|AEON\s+Mall(?:\s+\p{Lu}[\p{L}]*){0,2}|Aeon\s+Mall(?:\s+\p{Lu}[\p{L}]*){0,2}|Times\s+City|Royal\s+City|Smart\s+City|Ocean\s+Park|Gardenia|Indochina\s+Plaza|Lotte\s+Center|Keangnam)$/u;
        const mt = s.match(MALL_TAIL);
        if (mt) {
          const head = s.slice(0, mt.index).trim(); const hw = head.split(' ');
          const brandish = BRANDS.includes(head) || CHAINS.has(head) || hw.some(w => /\p{Ll}\p{Lu}/u.test(w) || /^[A-Z][A-Z0-9&'.-]{2,}$/.test(w)) || (hw.length <= 3 && !VN_CHARS.test(head) && !/^(Tòa|Toà|Tầng|Sảnh|Cổng|Block|Park|Khu|Trung tâm|Bãi)/i.test(head));
          if (head && brandish && !CHILD_WORDS.test(head)) { add('P4.4', `Địa điểm "${mt[1]}" dính vào tên — dạng chuẩn "Brand - ${mt[1]}"`, 'L1', 'warn'); s = head + ' - ' + mt[1]; }
        }
      }
      // learned places (streets, wards, areas seen as branch names): "Phở Thìn Mỹ Đình" → "Phở Thìn - Mỹ Đình
      if (!/ - /.test(s) && !official && L_PLACES.size && !F.some(f => f.code === 'P4.4' || f.code === 'P3.7')) {
        const w = s.split(' ');
        for (let n = Math.min(4, w.length - 2); n >= 1; n--) {
          const tail = w.slice(-n).join(' '), head = w.slice(0, -n).join(' ');
          if (L_PLACES.has(key(tail)) && !PARENTS.some(p => key(p) === key(tail)) && !/^(sai gon|ha noi|hanoi|ho chi minh|hcm|viet nam|vietnam)$/.test(key(tail)) && /^\p{Lu}/u.test(w[w.length - n]) && key(tail).length >= 5 && head.split(' ').length >= 2 && !TYPE_PREFIX_KEYS.some(([pk]) => key(head) === pk || key(head).startsWith(pk + ' ')) && !SINGLE_TYPE_WORDS.has(w[0].toLowerCase()) && !L_LEAD_OK.has(key(w[0])) && !/^(Chợ|Sân|Bến|Trạm|Ga|Cầu|Bệnh|Chung|Tòa|Toà|Trường|Công|Văn|Đại|Học|Viện|Phòng|Sửa|Dịch)/.test(w[0])) {
            add('P4.4', `Địa điểm "${tail}" dính vào tên — dạng chuẩn "Tên - Chi nhánh"`, 'L1', 'warn');
            s = head + ' - ' + tail; break;
          }
        }
      }
    }

    // P9.2 parent - child
    const parts = s.split(' - ');
    const isParent = x => PARENTS.some(p => key(p) === key(x));
    const childLike = x => CHILD_WORDS.test(x) || /^(Nhà|Khu|Khối|Tòa|Toà|Block|Tháp|Cổng|Sảnh|Phân khu)\s+[\p{Lu}\d][\p{L}\d.\x2D]{0,6}$/u.test(x);
    if (parts.length === 2 && ((CHILD_WORDS.test(parts[0]) && !CHILD_WORDS.test(parts[1])) || (isParent(parts[1]) && !isParent(parts[0]) && childLike(parts[0])))) {
      add('P9.2', 'POI con viết theo mẫu "Tên place cha - Toà/Block/Cổng" (P-03 §8)', 'L3'); s = parts[1] + ' - ' + parts[0];
    } else if (!/ - /.test(s)) {
      const p = PARENTS.find(p => s.endsWith(' ' + p) || (s.startsWith(p + ' ') && CHILD_WORDS.test(s.slice(p.length + 1))));
      if (p && (CHILD_WORDS.test(s) || CHILD_WORDS.test(s.replace(p, '').trim()))) {
        const child = s.replace(p, '').trim();
        if (!/^(Tòa nhà|Toà nhà|Tòa|Toà|Khu|Tháp|Block|Park|Landmark)$/i.test(child)) { add('P9.2', 'POI con thiếu " - ": "Tên place cha - Toà/Block"', 'L3'); s = p + ' - ' + child; }
      }
    }

    // P3.3 lost diacritics
    const toks = s.split(/\s+/);
    if (!VN_CHARS.test(s)) {
      const lowToks = toks.map(t => strip(t).toLowerCase());
      const hits = lowToks.filter(t => UNACCENT[t]);
      const strong = lowToks.filter(t => STRONG_UNACCENT.has(t));
      const accHits = lowToks.filter(t => L_ACCENT[t]);
      if (strong.length >= 1 && hits.length >= 2) {
        add('P3.3', 'Tên tiếng Việt bị mất dấu', 'L1');
        s = toks.map(t => UNACCENT[strip(t).toLowerCase()] || t).join(' ');
      } else if (false && toks.length >= 2 && accHits.length >= 2 && accHits.length / toks.filter(t => /\p{L}/u.test(t)).length >= 0.6 && !lowToks.some(t => ENGLISH.has(t))) {
        add('P3.3', 'Tên tiếng Việt bị mất dấu', 'L1');
        s = toks.map(t => L_ACCENT[strip(t).toLowerCase()] || t).join(' ');
      }
    }

    // official agency phrases keep their canonical casing (P-03 §13): "Ủy Ban Nhân Dân" → "Ủy ban Nhân dân"
    {
      const OFF = [['uy ban nhan dan', 'Ủy ban Nhân dân'], ['dai su quan', 'Đại sứ quán'], ['tong lanh su quan', 'Tổng Lãnh sự quán'], ['cong an', 'Công an'], ['vien kiem sat nhan dan', 'Viện Kiểm sát Nhân dân'], ['toa an nhan dan', 'Tòa án Nhân dân'], ['vien nghien cuu', 'Viện Nghiên cứu'], ['tram dung nghi', 'Trạm Dừng nghỉ'], ['tram y te', 'Trạm Y tế'], ['bao hiem xa hoi', 'Bảo hiểm Xã hội'], ['chi cuc thue', 'Chi cục Thuế'], ['kho bac nha nuoc', 'Kho bạc Nhà nước'], ['hop tac xa', 'Hợp tác xã'], ['quay thuoc', 'Quầy thuốc'], ['van phong cong chung', 'Văn phòng Công chứng'], ['dai ly ve may bay', 'Đại lý vé máy bay'], ['benh vien da khoa', 'Bệnh viện Đa khoa']];
      const ws = s.split(' ');
      for (const [k, canon] of OFF) {
        const n = canon.split(' ').length;
        for (let i = 0; i + n <= ws.length; i++) {
          const seg = ws.slice(i, i + n).join(' ');
          if (key(seg) === k && seg !== canon && seg.toLowerCase() === canon.toLowerCase() && !(i > 0 && seg === seg.toLowerCase())) {
            ws.splice(i, n, ...canon.split(' ')); add('P3.2', `Cụm chính thức viết đúng: "${canon}"`, 'L3'); break;
          }
        }
      }
      s = ws.join(' ');
    }
    // P3.2 casing
    const letters = s.replace(/[^\p{L}]/gu, '');
    const words = s.split(/\s+/);
    let cased = s;
    const rawL = nfc(raw).replace(/[^\p{L}]/gu, '');
    const rawAllUpper = rawL.length >= 6 && rawL === rawL.toUpperCase() && nfc(raw).split(/\s+/).filter(w => /\p{L}{3,}/u.test(w) && !ACRONYMS.has(w)).length >= 2;
    const allUpper = rawAllUpper || letters.length >= 4 && letters === letters.toUpperCase() && words.some(w => /\p{L}{2,}/u.test(w) && !ACRONYMS.has(w) && !BRANDS.includes(w)) &&
      !(words.length === 1 && letters.length <= 5) && !BRANDS.includes(s);
    const allLower = letters.length >= 3 && letters === letters.toLowerCase();
    const reTitle = (str) => {
      // sentence-case type prefix, title case for the rest, keep brand/acronyms
      let out = str.split(/\s+/).map((w, i) => {
        if (/^[-–&+]$/.test(w)) return w;
        if (ACRONYMS.has(w) || ACRONYMS.has(w.toUpperCase())) return w.toUpperCase() === 'SPA' ? 'Spa' : (ACRONYMS.has(w) ? w : w.toUpperCase());
        if (/^[a-z]+[A-Z]/.test(w)) return w; // iPhone-like
        if (i > 0 && LOWER_OK.has(w.toLowerCase()) && !/^\p{Lu}/u.test(w)) return w.toLowerCase();
        if (/\d/.test(w) && /^\p{L}{1,3}\d/u.test(w)) return w.toUpperCase();
        return titleWord(w, false);
      }).join(' ');
      // brands inside
      const b2 = applyBrandCase(out); out = b2.out;
      return out;
    };
    const fixPrefix = (str) => {
      const k2 = key(str);
      for (const [pk, canon] of TYPE_PREFIX_KEYS) {
        if (k2 === pk || k2.startsWith(pk + ' ')) {
          const n = canon.split(' ').length;
          const w = str.split(/\s+/);
          const head = w.slice(0, n).join(' ');
          const vnorm = x => x.replace(/oà/g, 'òa').replace(/oá/g, 'óa').replace(/oả/g, 'ỏa').replace(/oã/g, 'õa').replace(/oạ/g, 'ọa').replace(/uỵ/g, 'ụy').replace(/uý/g, 'úy');
          if (key(head) === pk) { const c2 = vnorm(head) === vnorm(canon) ? head : canon; return { str: c2 + (w.length > n ? ' ' + w.slice(n).join(' ') : ''), changed: head !== c2, n }; }
        }
      }
      return { str, changed: false, n: 0 };
    };
    let caseMsg = null;
    // a run of ≥2 shouting words inside an otherwise normal name: "Phòng khám NHA KHOA THẮNG LỢI", "Dao Niu Guo - LẨU BÒ TƯƠI"
    if (!allUpper && !allLower) {
      const ws = s.split(/\s+/);
      const shout = w => { const L = w.replace(/[^\p{L}]/gu, ''); return L.length >= 3 && L === L.toUpperCase() && !ACRONYMS.has(w) && !BRANDS.includes(w) && !/\d/.test(w); };
      let run = 0, hit = false; for (const w of ws) { run = shout(w) ? run + 1 : 0; if (run >= 2) hit = true; }
      if (hit) {
        caseMsg = 'Cụm từ viết TOÀN HOA trong tên — dùng Title Case';
        let r2 = 0; const flags = ws.map(shout); const out = ws.map((w, i) => (flags[i] && ((i > 0 && flags[i - 1]) || (i + 1 < ws.length && flags[i + 1]))) ? titleWord(w.toLowerCase()) : w);
        cased = out.join(' '); void r2;
      }
    }
    const ACR_FIX = { atm: 'ATM', bbq: 'BBQ', kfc: 'KFC', cgv: 'CGV', vip: 'VIP', tnhh: 'TNHH', thcs: 'THCS', thpt: 'THPT', gs25: 'GS25', pnj: 'PNJ', sjc: 'SJC' };
    if (!allUpper && words.some(w => ACR_FIX[w.toLowerCase()] && w !== ACR_FIX[w.toLowerCase()])) {
      caseMsg = 'Từ viết tắt/thương hiệu phải viết hoa (ATM, BBQ, TNHH…)';
      cased = words.map(w => ACR_FIX[w.toLowerCase()] || w).join(' ');
    }
    if (OFFICIAL_START.test(s) && !allUpper && !allLower && s.split(' ').length >= 3 && s.split(' ').slice(1).every(w => !/\p{Lu}/u.test(w))) {
      // official prefix followed by an all-lowercase proper name: "Sân bay nội bài" → "Sân bay Nội Bài"
      const ws = s.split(' '); const fp1 = fixPrefix(s); const n = Math.max(fp1.n, 2);
      const out = ws.map((w, i) => i < n ? (i === 0 ? w : w.toLowerCase()) : titleWord(w)).join(' ');
      if (out !== s) { caseMsg = 'Tên riêng sau loại hình chưa viết hoa chữ đầu'; add('P3.2', caseMsg, 'L3'); s = out; cased = s; }
    }
    if (OFFICIAL_START.test(s) && !allUpper && !allLower) {
      // official names keep the agency's sentence case; only each segment's first letter must be capital
      const seg = cased.split(' - ').map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(' - ');
      const fp0 = fixPrefix(seg);
      if (seg !== cased || fp0.changed) { caseMsg = (caseMsg ? caseMsg + '; ' : '') + 'Viết hoa chữ đầu tên/phân đoạn'; cased = fp0.str; }
      if (caseMsg && cased !== s) add('P3.2', caseMsg, 'L3');
      s = cased;
    } else
    if (allUpper) { caseMsg = 'Tên viết TOÀN HOA — dùng Title Case tự nhiên'; cased = reTitle(s.toLowerCase().split(' ').map((w, i) => s.split(' ')[i]).join(' ').toLowerCase()); }
    else if (allLower) { caseMsg = 'Tên viết toàn chữ thường'; cased = reTitle(s); }
    else {
      // mixed-case inside a Vietnamese syllable: ĐạI, VIệt
      if (words.some(w => VN_CHARS.test(w) && (/\p{Ll}\p{Lu}/u.test(w) || /^\p{Lu}{2,}\p{Ll}/u.test(w)) && w.length <= 7)) {
        caseMsg = 'Viết hoa lỗi giữa âm tiết'; cased = words.map(w => VN_CHARS.test(w) && (/\p{Ll}\p{Lu}/u.test(w) || /^\p{Lu}{2,}\p{Ll}/u.test(w)) && w.length <= 7 ? cap(w) : w).join(' ');
      }
      // lowercase words that should be capitalised (skip sentence-case type prefix)
      const fp = fixPrefix(cased);
      const w2 = fp.str.split(/\s+/);
      let skip = fp.n;
      if (!skip && SINGLE_TYPE_WORDS.has(w2[0].toLowerCase())) skip = 1;
      // learned: lead words whose sentence-case run is accepted ("Quán nhậu Chị Ba", "Tiệm thuốc Phùng Thị Điểm")
      if (L_LEAD_OK.has(key(w2[0])) && /^\p{Lu}/u.test(w2[0])) {
        let j = Math.max(skip, 1); while (j < w2.length && j < 4 && isLowerWord(w2[j])) j++;
        // the accepted run must be followed by a capitalised proper name; a lowercase run to the end is the name itself
        if (j < w2.length && !isLowerWord(w2[j])) skip = Math.max(skip, j);
        else skip = Math.max(skip, Math.min(fp.n || 1, w2.length));
      }
      let lowerFound = false;
      const COMPOUND = new Set(['ca phe', 'mam non', 'xang dau', 'tieu hoc', 'da khoa', 'cau long', 'thu phi', 'y te', 'cong chung', 'tiec cuoi', 'ngoai ngu', 'van hoa', 'the thao', 'my pham', 'thoi trang', 'dien thoai', 'vat lieu', 'xay dung', 'noi that', 'tu dong', 'cong nghe', 'co phan', 'dich vu', 'nhan dan', 'trung uong', 'quoc gia', 'quan doi', 'kiem sat', 'thi truong', 'quan ly', 'co so', 'phu', 'chinh']);
      const w3 = w2.map((w, i) => {
        if (i < skip) return w;
        if (i === 0 && /^\p{Ll}/u.test(w) && !/^[a-z]+[A-Z]/.test(w) && /\p{L}/u.test(w)) { lowerFound = true; return titleWord(w); }
        if (skip && i > skip - 1 && i > 0 && isLowerWord(w) && COMPOUND.has(key(w2[i - 1] + ' ' + w))) return w;
        if (i > 0 && isLowerWord(w) && !LOWER_OK.has(w.toLowerCase()) && !/^[a-z]+[A-Z]/.test(w) && !/^(vs|v\.v)$/.test(w) && /\p{L}{2,}/u.test(w) && !/^[a-z]{1,3}\d/.test(w) && !/^(cơ|sở)$/.test(w) || (i > 0 && /^(cơ)$/.test(w))) {
          lowerFound = true; return titleWord(w);
        }
        return w;
      });
      if (fp.changed) { caseMsg = (caseMsg ? caseMsg + '; ' : '') + `Phần loại hình viết kiểu câu: "${fp.str.split(' ').slice(0, fp.n).join(' ')}"`; }
      if (lowerFound) { caseMsg = (caseMsg ? caseMsg + '; ' : '') + 'Từ trong tên riêng/mô tả chưa viết hoa chữ đầu'; }
      if (fp.changed || lowerFound) cased = w3.join(' ');
    }
    if (allUpper || allLower) {
      const fp = fixPrefix(cased); cased = fp.str;
    }
    if (!OFFICIAL_START.test(s) || allUpper || allLower) {
      if (caseMsg && cased !== s) { add('P3.2', caseMsg, 'L3'); s = cased; }
      else if (caseMsg && allUpper) { add('P3.2', caseMsg, 'L3'); }
    }

    // P7.1 category
    if (ctx.categoryChecked !== false && ctx.category !== undefined && !String(ctx.category || '').trim()) add('P7.1', 'Chưa chọn loại địa điểm (category)', 'L0');

    // category-specific hints (P-03 §3–§13)
    const cat = key(ctx.category || '');
    const hint = categoryHint(cat, s);
    if (hint) F.push({ code: 'INFO', field: 'name', msg: hint.msg, level: 'L1', severity: 'warn', suggest: hint.suggest });

    // de-dup
    const seen = new Set(); const out = [];
    for (const f of F) { const k = f.code + f.msg; if (!seen.has(k)) { seen.add(k); out.push(f); } }
    if (!out.some(f => f.code !== 'INFO' && f.code !== 'P7.1') && squash(s) !== squash(nfc(raw)) && squash(s).toLowerCase() === squash(nfc(raw)).toLowerCase()) out.unshift({ code: 'P3.2', field: 'name', msg: 'Viết hoa sai (Title Case tự nhiên, giữ đúng cách viết brand)', level: 'L3', severity: 'error' });
    const notName = out.some(f => f.code === 'P3.7' && f.level === 'L0');
    return { findings: out, fixed: notName ? null : squash(s) };
  }

  function categoryHint(cat, s) {
    const k = key(s);
    const rules = [
      ['khach san', /^(khach san|hotel|ks )/, 'Khách sạn', /hotel|resort|inn|homestay|hostel|motel|residence|suites?|apartment/],
      ['nha hang', /^nha hang/, 'Nhà hàng', /restaurant|bbq|buffet|lau|quan|pho|bun|com|kitchen|bistro|grill|sushi|steak|pizza|ga |ga$|oc |vit|de |nhau|bia|chay|hai san|hotpot|nuong|mi |banh/],
      ['benh vien', /^(benh vien|vien)/, 'Bệnh viện', /hospital|vinmec|medlatec/],
      ['nha thuoc', /^(nha thuoc|quay thuoc)/, 'Nhà thuốc', /pharmacy|pharmacity|long chau|an khang|duoc/],
      ['mam non', /^(truong mam non|mam non|nha tre)/, 'Trường Mầm non', /kids|kindergarten|preschool|montessori/],
    ];
    for (const [c, ok, pref, exempt] of rules) {
      if (cat.includes(c) && !ok.test(k) && !exempt.test(k) && !CHAINS.has(applyBrandCase(s).brand || '')) {
        return { code: 'P3.7', msg: `Category "${c}" — P-03 khuyến nghị tên dạng "${pref} + Tên" nếu biển hiệu như vậy`, suggest: pref + ' ' + s };
      }
    }
    return null;
  }

  // ===================== HOUSE NUMBER =====================
  const LEVEL_WORDS = [
    [/(?<![\p{L}])(?:nghách|nghach|ngach|ngác|ngạch)(?![\p{L}])\.?/giu, 'Ngách', 'A8.6', 'Lỗi chính tả cấp "Ngách"'],
    [/\bNgh\.\s?/g, 'Ngách', 'A2.4', 'Viết tắt "Ngh." → "Ngách"'],
    [/(?<![\p{L}])(?:ngỏ|ngo|ngỗ)(?=\s*\d)/giu, 'Ngõ', 'A8.6', 'Lỗi chính tả cấp "Ngõ"'],
    [/\bNg\.\s?/g, 'Ngõ', 'A2.4', 'Viết tắt "Ng." → "Ngõ"'],
    [/\bLane\b/gi, 'Ngõ', 'A2.7', 'Từ tiếng Anh "Lane" → "Ngõ"'],
    [/\bAlley\b/gi, 'Hẻm', 'A2.7', 'Từ tiếng Anh "Alley" → "Hẻm"'],
    [/^(\d+)\s?ng\.?$/i, 'Ngõ $1', 'A2.4', 'Dính chữ "ng" — có thể là "Ngõ" (cần xác nhận)'],
  ];
  const LEVEL_NAME = ['Ngõ', 'Ngách', 'Hẻm'];

  function parseLanes(str) {
    // returns {house, path:[...], explicit:boolean, rest} or null
    const s = str.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
    const tokRe = /(Ngõ|Ngách|Hẻm|Kiệt)\s*(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*)|((?:[A-Z]{1,2}(?=\d))?\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*)/gu;
    let m; const toks = []; let consumed = '';
    while ((m = tokRe.exec(s))) {
      toks.push(m[1] ? { lvl: cap(m[1].toLowerCase()).replace('Ngo', 'Ngõ'), nums: m[2].split('/') } : { lvl: null, nums: m[3].split('/') });
      consumed += m[0];
    }
    const leftover = s.replace(tokRe, '').replace(/[,\s\/\x2D]+/g, '').replace(/^số/i, '');
    if (!toks.length || leftover.length) return null;
    const lvlRank = l => ({ 'Ngõ': 1, 'Kiệt': 1, 'Ngách': 2, 'Hẻm': 3 }[l] || 0);
    let house = null; let path = [];
    const labeled = toks.filter(t => t.lvl);
    if (!labeled.length) {
      // pure numbers / slash: north rule A-02 §3.1 → outer→inner, last = house number
      if (toks.length === 1) {
        const n = toks[0].nums;
        if (/^[A-Z]/.test(n[0])) return null;   // "CT4", "BT2": unit/building code, handled as A2.5
        if (n.length === 1) return { house: n[0], path: [], explicit: false, slash: false };
        return { house: n[n.length - 1], path: n.slice(0, -1), explicit: false, slash: true };
      }
      return null;
    }
    // first unlabeled token before labels = house (may itself be slash: "27/8 ngõ 294")
    const first = toks[0];
    let prefixNums = [];
    if (!first.lvl) {
      if (first.nums.length === 1) house = first.nums[0];
      else { house = first.nums[first.nums.length - 1]; prefixNums = first.nums.slice(0, -1); }
    }
    // labeled tokens: if order is inner→outer (ngách 10 ngõ 199) reverse
    const lab = labeled.slice();
    const ranks = lab.map(t => lvlRank(t.lvl));
    const innerFirst = ranks.length > 1 && ranks[0] > ranks[ranks.length - 1];
    const ordered = innerFirst ? lab.reverse() : lab;
    // build path outer→inner
    for (const t of ordered) {
      if (t.nums.length > 1) {
        // "Ngách 32/84" full path given; merge if it extends current path
        if (path.length && t.nums[0] === path[0]) path = t.nums.slice();
        else if (path.length && t.nums.length > 1 && path[path.length - 1] === t.nums[0]) path = path.concat(t.nums.slice(1));
        else path = path.concat(t.nums);
      } else path.push(t.nums[0]);
    }
    if (prefixNums.length) path = path.concat(prefixNums);
    return { house, path, explicit: true, slash: false, innerFirst, lvl: ordered[0].lvl };
  }

  function laneString(path, region, lvlHint) {
    if (!path.length) return '';
    if (region === 'Nam') return 'Hẻm ' + path.join('/');
    if (region === 'Trung' && lvlHint === 'Kiệt') return 'Kiệt ' + path.join('/');
    const lvl = LEVEL_NAME[Math.min(path.length, 3) - 1];
    return lvl + ' ' + path.join('/');
  }
  function laneReading(house, path, street, region) {
    const steps = [];
    if (house) steps.push('Số nhà ' + house);
    const names = region === 'Nam' ? ['Hẻm', 'Hẻm', 'Hẻm'] : ['Ngõ', 'Ngách', 'Hẻm', 'Hẻm', 'Hẻm'];
    for (let i = path.length - 1; i >= 0; i--) steps.push((names[i] || 'Hẻm') + ' ' + path[i]);
    if (street) steps.push(street);
    return steps.join(' → ');
  }

  function checkHouse(rawHouse, ctx) {
    ctx = ctx || {};
    const region = ctx.region || regionOf(ctx.province);
    const F = []; const add = (code, msg, level, severity) => F.push({ code, field: 'house', msg, level: level || 'L3', severity: severity || 'error' });
    const raw = rawHouse == null ? '' : String(rawHouse);
    let s = squash(nfc(raw));
    let structure = null;
    if (!s) { add('A11.1', 'Chưa có số nhà / ngõ / ngách', 'L0'); return { findings: F, fixed: '', structure }; }
    if (/^(không|ko|k|chưa|n\/a|na|none|-)(\s*có)?(\s*số nhà)?\.?$/i.test(s)) { add('A11.1', 'Không có số nhà — để trống thay vì ghi chữ', 'L3'); return { findings: F, fixed: '', structure }; }
    if (/^\s|\s$| {2,}/.test(raw)) add('A2.7', 'Khoảng trắng thừa', 'L3', 'warn');

    // plus code
    if (PLUSCODE.test(s)) { add('A2.7', 'Plus Code (Google) không phải số nhà', 'L1'); s = squash(s.replace(PLUSCODE, '').replace(/^[,\s]+/, '')); }
    // pasted full address: split by comma, drop admin segments
    let segs = s.split(/\s*,\s*/).filter(Boolean);
    const adminIdx = segs.findIndex((g, i) => i > 0 && (ADMIN_SEG.test(g) || DISTRICTS_OLD.some(d => key(g) === key(d)) || POSTCODE.test(g) || /^(Việt Nam|Vietnam)$/i.test(g)));
    if (POSTCODE.test(s)) add('A12.4', 'Mã bưu chính nằm trong số nhà', 'L3');
    if (DISTRICT_RE.test(s) || segs.some((g, i) => i > 0 && DISTRICTS_OLD.some(d => key(g) === key(d) || key(g).startsWith(key(d) + ' ')))) add('A1.3', 'Còn tên quận/huyện cũ (bỏ cấp huyện từ 1/7/2025)', 'L3');
    if (adminIdx > 0 || /\b(Hà Nội|Hanoi|Việt Nam|Vietnam|TP\.?\s?HCM)\b/i.test(s)) {
      add('A2.7', 'Số nhà chứa phường/thành phố/quốc gia (dán nguyên địa chỉ) — chỉ nhập số nhà, ngõ, ngách', 'L3');
      if (adminIdx > 0) segs = segs.slice(0, adminIdx);
      segs = segs.filter(g => !ADMIN_SEG.test(g) && !/^(Việt Nam|Vietnam)$/i.test(g));
      // keep only segments that carry a number (house / lane / unit code); place names after it are ward/area
      const withNum = segs.filter(g => /\d/.test(g));
      segs = withNum.length ? withNum : [];
      s = segs.join(', ');
    }
    {
      const AREA_SEG = /(Vincom|Times City|Ocean Park|Smart ?City|Landmark|Aeon|AEON|KĐT|Khu đô thị|Khu Đô Thị|kđt|KDT|KDC|Khu dân cư|Vinhomes|Vinhome|Royal City|Keangnam|Khu tập thể|Cụm công nghiệp|Dự án)/i;
      const parts2 = s.split(/\s*,\s*|\s+-\s+/).filter(Boolean);
      if (parts2.length > 1 && parts2.some(g => AREA_SEG.test(g) && !/^(Tầng|Lô|Toà|Tòa|Block)/i.test(g)) && parts2.some(g => !AREA_SEG.test(g))) {
        add('A2.7', 'Ô số nhà chứa tên khu đô thị/toà/TTTM — tên khu chọn ở bản đồ, không nhập vào số nhà', 'L1');
        s = parts2.map(g => { if (!AREA_SEG.test(g) || /^(Tầng|Lô|Toà|Tòa|Block)/i.test(g)) return g; const cut = g.slice(0, g.search(AREA_SEG)).trim(); return /\d/.test(cut) ? cut : ''; }).filter(Boolean).join(', ');
        segs = s.split(/\s*,\s*/);
      }
    }
    if (segs.length > 1) {
      const withNum = segs.filter(g => /\d/.test(g));
      if (withNum.length && withNum.length < segs.length) { add('A2.7', 'Số nhà kèm tên khu/toà/TTTM — tên khu không nhập vào ô số nhà', 'L1'); s = withNum.join(', '); }
    }
    // remove street name (and P./Đ. prefix) contained in house field
    const streetKey = key(ctx.street || '').replace(/^(ngo|ngach|hem) [\d/a-z]+ /, '').replace(/^(pho|duong) /, '');
    const before = s;
    s = s.split(/\s*,\s*/).map(g => g.replace(/(^|\s)(P\.|Đ\.|Phố|Đường|đường|phố|St\.?|Street)\s+[\p{Lu}\p{Ll}][\p{L}\d .]*$/u, '$1').trim()).filter(Boolean).join(', ');
    s = s.replace(/(^|\s)(KĐT|Khu đô thị|Khu Đô Thị|khu đô thị|kđt|KDT|Khu tập thể|Khu Tập Thể|Chung cư|chung cư|Cụm công nghiệp)\s+[\p{L}\d .]*$/u, '$1').trim();
    s = s.replace(/^(P\.|Đ\.|Phố|Đường)\s+[\p{L} ]+\/(?=\S)/u, '').trim();      // "Đường Mỹ Đình/Ngõ 179"
    if (streetKey && streetKey.length >= 4) {
      const words = s.split(' ');
      for (let i = 1; i < words.length; i++) {
        const tail = words.slice(i).join(' ');
        if (key(tail) && streetKey.startsWith(key(tail).split(' ').slice(0, 2).join(' ')) && key(tail).length >= 4 && /^\p{L}/u.test(words[i]) && !/^(ngõ|ngách|hẻm|kiệt|tầng|lô|toà|tòa)$/i.test(words[i])) {
          s = words.slice(0, i).join(' ').replace(/[,\s]+$/, ''); break;
        }
      }
    }
    s = s.replace(/[,\s]+$/, '').trim();
    if (s !== before && !F.some(f => f.code === 'A2.7' && /phường/.test(f.msg))) add('A2.7', 'Số nhà chứa tên đường — tên đường nhập ở ô "Đường phố"', 'L3');

    // "Số 5", "số101", "No. 27"
    if (/^(nhà|số nhà)\s*\d/i.test(s)) { add('A2.6', 'Bỏ chữ "Nhà" — chỉ ghi số', 'L3'); s = s.replace(/^(nhà|số nhà)\s*/i, ''); }
    if (/^0+$/.test(s)) { add('A11.1', 'Số nhà "0" không phải số nhà thật — để trống nếu không có', 'L3'); return { findings: dedup(F), fixed: '', structure }; }
    if (/\(.*\)/.test(s)) { add('A2.7', 'Phần trong ngoặc không thuộc số nhà', 'L1'); s = squash(s.replace(/\s*\([^)]*\)\s*/g, ' ')); }
    if (/(?<![\p{L}])tâng(?![\p{L}])/iu.test(s)) { add('A8.6', 'Lỗi chính tả "tâng" → "Tầng"', 'L3'); s = s.replace(/(?<![\p{L}])tâng(?![\p{L}])/giu, 'Tầng'); }
    if (/^(số|so|só|sô|No\.?|N°)\s*\d/i.test(s)) { add('A2.6', 'Bỏ tiền tố "Số"/"No." — chỉ ghi số', 'L3'); s = s.replace(/^(số|so|só|sô|No\.?|N°)\s*/i, ''); }

    // level words normalisation
    for (const [re, rep, code, msg] of LEVEL_WORDS) {
      if (re.test(s)) { add(code, msg, code === 'A2.4' && /Dính/.test(msg) ? 'L1' : 'L3', code === 'A2.4' && /Dính/.test(msg) ? 'warn' : 'error'); s = s.replace(re, rep); }
      re.lastIndex = 0;
    }
    if (/(?<![\p{L}])(ngõ|ngách|hẻm|kiệt)(?![\p{L}])/u.test(s)) { add('A2.1', 'Tên cấp đường viết hoa chữ đầu: "Ngõ", "Ngách", "Hẻm"', 'L3'); }
    s = s.replace(/(?<![\p{L}])(ngõ|ngách|hẻm|kiệt)(?![\p{L}])/gu, w => cap(w));
    s = s.replace(/(\d)(Ngõ|Ngách|Hẻm)/g, '$1 $2').replace(/(Ngõ|Ngách|Hẻm|Kiệt)(\d)/g, '$1 $2');

    // region convention A2.9
    if (region === 'Bac' && /Kiệt/.test(s)) add('A2.9', 'Miền Bắc dùng "Ngõ/Ngách" thay cho "Kiệt"', 'L1');
    if (region === 'Bac' && /^\s*(\d+[A-Za-z]?\s+)?Hẻm\s+\d+\s*$/.test(s)) add('A2.9', 'Ở miền Bắc "Hẻm" là cấp 3 trở xuống; nhánh cấp 1 gọi là "Ngõ"', 'L1');
    if (region === 'Nam' && /(Ngõ|Ngách)/.test(s)) add('A2.9', 'Miền Nam dùng "Hẻm"', 'L1');

    // try lane parse
    const p = parseLanes(s);
    if (p) {
      let canon;
      if (region === 'Nam' && !p.explicit) {
        canon = s.replace(/\s*\/\s*/g, '/');
        structure = { house: p.slash ? null : p.house, path: p.slash ? p.path.concat([p.house]) : [], ambiguous: p.slash };
        if (p.slash) { F.push({ code: 'A2.2', field: 'house', msg: 'Chuỗi gạch chéo miền Nam: chưa đủ căn cứ xác định thành phần cuối là số nhà hay hẻm (A-02 §5–§6) — giữ nguyên', level: 'L0', severity: 'warn' }); }
      } else {
        const house = p.house;
        const lane = laneString(p.path, region, p.lvl);
        canon = [house, lane].filter(Boolean).join(' ');
        structure = { house, path: p.path, lane, reading: laneReading(house, p.path, ctx.street, region) };
        if (p.slash && region !== 'Nam') add('A2.2', `Chuỗi gạch chéo chưa ghi tên cấp — theo A-02 §3 (miền Bắc) đọc: ${structure.reading}`, 'L1');
        if (p.innerFirst) { const i = F.findIndex(f => f.code === 'A2.1'); if (i >= 0) F.splice(i, 1); add('A2.1', 'Chuỗi ngõ ghi từ trong ra ngoài, chữ thường — chuẩn miền Bắc: số nhà + "Ngách <ngõ>/<ngách>"', 'L3'); }
        if (p.explicit && !p.innerFirst && canon !== s.replace(/\s*\/\s*/g, '/') && !F.some(f => f.code === 'A2.1')) add('A2.1', 'Chuỗi ngõ/ngách chưa theo dạng chuẩn', 'L3');
        if (!house && p.path.length) add('A11.4', 'Chỉ có ngõ/ngách, chưa có số nhà', 'L0', 'warn');
      }
      s = canon;
    } else {
      // unit/building/lot codes
      // trailing street / residential-group words after a leading number: "720A Điện Biên Phủ", "109 Tổ 3"
      const tm = s.match(/^(\d+[A-Za-z]?)\s+((?:Tổ|tổ)\s+\d+|\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){1,4}|\p{Ll}+(?:\s+[\p{Ll}\d]+){1,4})$/u);
      if (tm && !UNIT_RE.test(tm[2].replace(/^Tổ\s+\d+$/, ''))) { add('A2.7', 'Số nhà kèm tên đường/tổ dân phố — chỉ nhập số nhà', 'L1'); s = tm[1]; }
      if (/^\d+[A-Za-z]?$/.test(s)) { /* now clean */ }
      else if (/[\p{L}]/u.test(s) && /\d/.test(s) && UNIT_RE.test(s)) {
        add('A2.5', 'Mã toà / lô / tầng / gian hàng trong ô số nhà — cấu trúc POI cha/con, không phải số nhà', 'L0', 'warn');
        // keep only unit tokens (keyword + code, codes, numbers); drop place words (Aeon Mall, The Manor, Sunshine City…)
        const UNIT_TOK = /(?<![\p{L}\d])(?:(Tầng(?:\s+hầm)?|Lô|Toà|Tòa|Block|Villa|Căn(?:\s+số)?|Liền\s+kề|LK|Gian(?:\s+hàng)?|Kiot|Ki-ốt|Shophouse|Ô\s+đất|Nhà|Km|Sảnh|Tháp|Khu|Park|Landmark)\s*([A-Z0-9][\w.\x2D\/]*(?:\s*-\s*\d+)?)|([A-Z]{0,4}\d+[A-Z0-9.\x2D\/]*|\d+[A-Za-z]{1,4}\d*[A-Z0-9.\x2D]*))(?![\p{L}\d])/giu;
        const units = []; let mm; const src = s;
        while ((mm = UNIT_TOK.exec(src))) {
          if (/^QL\d/i.test(mm[0]) || /^(Hà|Ha)$/i.test(mm[0])) continue;
          if (mm[1]) { let kw = mm[1].replace(/\s+/g, ' '); kw = /^(lk|km)$/i.test(kw) ? (kw.toLowerCase() === 'lk' ? 'LK' : 'Km') : cap(kw).replace(/^Căn số$/, 'Căn').replace(/^Ô đất$/, 'Ô đất'); units.push(kw === 'LK' || kw === 'Km' ? kw + mm[2].toUpperCase() : kw + ' ' + mm[2].toUpperCase()); }
          else units.push(mm[3].toUpperCase());
        }
        if (units.length) {
          const rest = src.replace(UNIT_TOK, ' ').replace(/[,\x2D–\s]+/g, ' ').replace(/(?<![\p{L}])(số|mặt trước|mặt sau|chân|tại|ở)(?![\p{L}])/giu, ' ').trim();
          if (/\p{L}{2,}/u.test(rest)) add('A2.7', 'Ô số nhà kèm tên khu/toà/TTTM — chỉ giữ mã toà, tầng, lô, gian', 'L1');
          s = units.join(', ');
        } else {
          s = s.replace(/\b(tầng|lô|toà|tòa|gian hàng|liền kề|biệt thự|nhà)\b/giu, w => cap(w)).replace(/\b(ct|tt|bt|hh|lk|sh|cc|nv)(\d)/gi, (m, a, b) => a.toUpperCase() + b);
        }
        if (!/\d/.test(s)) add('A11.1', 'Không có số nhà', 'L0');
      } else if (!/\d/.test(s)) {
        add('A11.1', 'Không có số nhà (chỉ có tên khu/địa danh)', 'L0');
      }
    }
    return { findings: dedup(F), fixed: s, structure };
  }

  // ===================== STREET =====================
  function checkStreet(rawStreet, ctx) {
    ctx = ctx || {};
    const region = ctx.region || regionOf(ctx.province);
    const F = []; const add = (code, msg, level, severity) => F.push({ code, field: 'street', msg, level: level || 'L3', severity: severity || 'error' });
    const raw = rawStreet == null ? '' : String(rawStreet);
    if (raw !== raw.normalize('NFC') || /Ð/.test(raw)) add('A6.4', 'Unicode không chuẩn (NFD / chữ Ð)', 'L3');
    let s = squash(nfc(raw).replace(/Ð/g, 'Đ'));
    let moved = null;
    if (!s) { add('A11.2', 'Chưa có đường phố', 'L0'); return { findings: F, fixed: '', moved }; }
    if (/^(n\/a|na|none|null|-|\.|không|khong)$/i.test(s)) { add('A3.8', 'Giá trị giữ chỗ, không phải tên đường', 'L0'); return { findings: F, fixed: '', moved }; }

    // junk: parentheses, commas, admin
    if (/\(.*\)/.test(s)) { add('A6.6', 'Rác trong ngoặc đi kèm tên đường', 'L1'); s = squash(s.replace(/\(.*?\)/g, '')); }
    if (/,/.test(s)) {
      add('A6.6', 'Tên đường kèm phường/quận/thành phố', 'L3');
      s = s.split(/\s*,\s*/)[0];
    }
    if (/^(Hà Nội|Hanoi|Ha Noi|Hanoi City|Ha Noi City|Thành phố Hà Nội|HCM|Hồ Chí Minh)$/i.test(s)) { add('A3.3', 'Ô đường phố chứa tên thành phố — chọn đường phố gần nhất', 'L0'); return { findings: F, fixed: s, moved, notStreet: true }; }
    if (/^(Hà Nội|Hanoi|Ha Noi)\s+\p{Lu}/iu.test(s) || /\s(Hanoi|Ha Noi)$/i.test(s)) { add('A3.3', 'Tên thành phố trong field đường', 'L3'); s = s.replace(/^(Hà Nội|Hanoi|Ha Noi)\s+|\s+(Hanoi|Ha Noi)$/i, '').trim(); }
    // abbreviations / doubled prefix
    if (/^(Đ\.|P\.|đ\.|p\.)\s*/.test(s)) { add('A6.1', 'Viết tắt tiền tố "Đ."/"P." → "Đường"/"Phố"', 'L3'); s = s.replace(/^(Đ\.|đ\.)\s*/, 'Đường ').replace(/^(P\.|p\.)\s*/, 'Phố '); }
    if (/\b(St\.?|Street|Road|Rd\.?)$/i.test(s)) { add('A6.2', 'Tiền tố/hậu tố tiếng Anh "St"/"Street"', 'L1'); s = s.replace(/\s*\b(St\.?|Street|Road|Rd\.?)$/i, '').trim(); }
    if (/^(Đường|Phố)\s+(Đường|Phố)\b/i.test(s)) { add('A6.1', 'Lặp tiền tố loại đường', 'L3'); s = s.replace(/^(Đường|Phố)\s+(?=(Đường|Phố)\b)/i, ''); }

    // lane chain inside street field: "Ngõ 371 Phố Kim Mã"
    const lm = s.match(/^((?:(?:Ngõ|Ngách|Hẻm|Kiệt|ngõ|ngách|hẻm|kiệt)\s*\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*\s*)+)(.*)$/u);
    if (lm && lm[2].trim()) {
      const laneTxt = lm[1].trim().replace(/^(\p{Ll})/u, c => c.toUpperCase());
      add('A2.7', `"${laneTxt}" thuộc ô Số nhà/ngõ/ngách — ô Đường phố chỉ ghi trục chính`, 'L1');
      moved = laneTxt.replace(/\s*\/\s*/g, '/');
      s = lm[2].trim();
      // conflict with house lane
      const hk = key(ctx.house || '');
      const nums = (moved.match(/\d+/g) || []);
      const hnums = (String(ctx.house || '').match(/(?:ngõ|ngách|hẻm|ng\.|ngh\.)\s*([\d/]+)/gi) || []).join(' ').match(/\d+/g) || [];
      if (hnums.length && nums.length && !nums.every(n => hnums.includes(n)) && !hnums.every(n => nums.includes(n))) {
        add('A9.4', `Ngõ ở ô đường (${moved}) khác ngõ ở ô số nhà — kiểm tra lại`, 'L0', 'warn');
      }
      void hk;
    }
    // unit / house number glued to street: "Lô 9-TT4 Trần Văn Lai", "CT4 Đỗ Đình Thiện", "5a P. Thành Công", "Hoàng Trọng Mậu lô đất số 44"
    {
      let um = s.match(/^((?:Lô|lô|Ô đất)\s+\S+|[A-Z]{1,3}\d+[A-Za-z]?(?:-\d+)?|\d+[A-Za-z]?)\s+((?:P\.|Đ\.|Phố|Đường)\s*)?(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){0,4})$/u);
      if (um && !/^(Ngõ|Ngách|Hẻm)/.test(s)) {
        add('A6.6', `"${um[1]}" là số nhà/mã lô — chuyển sang ô Số nhà`, 'L1');
        moved = moved || um[1]; s = ((um[2] || '').replace(/^P\.\s*/, 'Phố ').replace(/^Đ\.\s*/, 'Đường ') + um[3]).trim();
      }
      const sm = s.match(/^(.*?\p{L})\s+((?:lô|Lô)(?:\s+đất)?\s+(?:số\s+)?\S+)$/u);
      if (sm) { add('A6.6', `Phần "${sm[2]}" không thuộc tên đường`, 'L1'); moved = moved || sm[2]; s = sm[1]; }
    }
    // typos
    for (const [bad, good] of Object.entries(STREET_TYPOS)) {
      if (s.toLowerCase().includes(bad)) { add('A6.5', `Sai chính tả: "${bad}" → "${good}"`, 'L3'); s = s.replace(new RegExp(escRe(bad), 'i'), good); }
    }
    // learned gazetteer: known streets / known non-streets
    {
      const core = s.replace(/^(Phố|Đường)\s+/, '');
      const known = L_STREETS[key(core)];
      if (known && !/^(Ngõ|Ngách|Hẻm)\s/.test(s)) {
        const hasPrefix = /^(Phố|Đường)\s/.test(s);
        if (!hasPrefix) F.push({ code: 'A6.1', field: 'street', msg: `Thiếu tiền tố loại đường — tuyến này là "${known}"`, level: 'L3', severity: 'warn', options: [known] });
        else if (!VN_CHARS.test(core) && VN_CHARS.test(known.replace(/^(Phố|Đường)\s+/, ''))) add('A6.2', 'Tên đường không dấu', 'L3');
        else if (core !== known.replace(/^(Phố|Đường)\s+/, '') && key(core) === key(known.replace(/^(Phố|Đường)\s+/, '')) && core.toLowerCase() === known.replace(/^(Phố|Đường)\s+/, '').toLowerCase()) add('A6.3', 'Viết hoa chữ đầu mỗi âm tiết của tên đường', 'L3');
        else if (!VN_CHARS.test(core) && !VN_CHARS.test(known)) { /* same */ }
        if (!hasPrefix || (!VN_CHARS.test(core) && VN_CHARS.test(known.replace(/^(Phố|Đường)\s+/, ''))) || core.toLowerCase() === known.replace(/^(Phố|Đường)\s+/, '').toLowerCase()) s = hasPrefix ? s.replace(core, known.replace(/^(Phố|Đường)\s+/, '')) : known;
        return { findings: dedup(F), fixed: s, moved };
      }
      const ns = L_NON_STREETS[key(s)] || (L_WARDS.has(key(s)) ? 'A3.1' : null);
      if (ns || PLUSCODE.test(s) || /^(gần|cạnh|đối diện|sau|trước|ngã tư|vòng xoay|chân cầu)\s/i.test(s) || /(?<![\p{L}])(Ward|Hamlet|Village|Crossroads?|District|Floor)(?![\p{L}])/u.test(s)) {
        const code = ns || (/(Ward|District)/.test(s) ? 'A3.1' : /(Hamlet|Village)/.test(s) ? 'A3.6' : 'A3.8');
        add(code, 'Ô đường phố không phải tên đường (tên phường/thôn, Plus Code, mô tả vị trí) — chọn đường phố gần nhất', 'L0');
        if (/(?<![\p{L}])(Ward|Hamlet|Village|Crossroads?|District|Floor)(?![\p{L}])/u.test(s) || !VN_CHARS.test(s) && s.split(' ').filter(t => UNACCENT[strip(t).toLowerCase()]).length >= 1 && !PLUSCODE.test(s)) add('A6.2', 'Tên không dấu / tiếng Anh', 'L0');
        return { findings: dedup(F), fixed: s, moved, notStreet: true };
      }
    }
    // area/building/village in street field
    let area = s.match(AREA_IN_STREET) || s.match(/(?<![\p{L}])(Apartment|Residence|Tower|Plaza|Building|Mall|Center|Centre)(?![\p{L}])/u);
    // "Phố Đình Thôn", "Đường Làng Tám": village words inside a prefixed street name are part of the name
    if (area && /^(Phố|Đường|Ngõ)\s/.test(s) && /^(Thôn|Xóm|Làng|Tổ \d+|Lô|Landmark|Dự án)$/.test(area[1])) area = null;
    if (area || /^[A-Z]{1,3}\d+[A-Z]?(-\d+)?$/.test(s) || /^Lô\b/i.test(s)) {
      const w = area ? area[1] : s;
      let code = 'A3.4';
      if (/Thôn|Xóm|Tổ|Cụm|Làng/i.test(w)) code = 'A3.6';
      else if (/Toà|Tòa|TTTM|Aeon|Vincom|Landmark/i.test(w)) code = 'A3.5';
      else if (/Hanoi|Ha Noi/i.test(w)) code = 'A3.3';
      add(code, `Ô đường phố chứa tên khu/toà/thôn ("${w}") — chọn đường phố gần nhất`, 'L0');
      return { findings: dedup(F), fixed: s, moved, notStreet: true };
    }
    // unaccented
    if (!VN_CHARS.test(s) && s.split(' ').filter(t => UNACCENT[strip(t).toLowerCase()]).length >= 2) add('A6.2', 'Tên đường không dấu', 'L1');
    // casing
    const wds = s.split(' ');
    const fixedCase0 = wds.map((w, i) => /^\d/.test(w) ? w : (/^[A-Z]\d/.test(w) ? w : (/^(QL|ĐT|TL|ĐH|DT|ĐX)\.?\d*/i.test(w) ? w.toUpperCase() : titleWord(w, true)))).join(' ');
    const fixedCase = fixedCase0.replace(/^(Quốc Lộ|Tỉnh Lộ|Đường Tỉnh|Đại Lộ|Vành Đai|Đường Huyện|Hương Lộ|Cao Tốc)(?![\p{L}])/u, m => m.charAt(0) + m.slice(1).toLowerCase())
      .replace(/^(Quốc lộ|Tỉnh lộ|Đường tỉnh|Đại lộ|Vành đai|Đường huyện|Cao tốc)/i, m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
    const midCaps = wds.some(w => /\p{Ll}\p{Lu}/u.test(w));
    if (fixedCase !== s && (wds.some(w => isLowerWord(w)) || midCaps || wds.some(w => w.length > 3 && isUpperWord(w) && !/\d/.test(w)))) {
      add('A6.3', 'Viết hoa chữ đầu mỗi âm tiết của tên đường', 'L3'); s = fixedCase;
    }
    // prefix missing (north)
    if (!STREET_PREFIX.test(s)) {
      if (region === 'Bac') F.push({ code: 'A6.1', field: 'street', msg: 'Miền Bắc phân biệt "Phố" và "Đường" — thêm tiền tố đúng', level: 'L1', severity: 'warn', options: ['Phố ' + s, 'Đường ' + s] });
      else { F.push({ code: 'A6.1', field: 'street', msg: 'Thiếu tiền tố loại đường "Đường"', level: 'L3', severity: 'warn', options: ['Đường ' + s] }); s = 'Đường ' + s; }
    }
    return { findings: dedup(F), fixed: s, moved };
  }

  function dedup(F) { const seen = new Set(); return F.filter(f => { const k = f.code + '|' + f.msg; if (seen.has(k)) return false; seen.add(k); return true; }); }

  // ===================== CATEGORY (linear model over name words, learned) =====================
  // TF-IDF (sublinear, l2) of word unigrams/bigrams/first word → pruned multinomial logistic regression.
  const CM = LEARNED.category_lr || null;
  // compact model: hashed features (FNV-1a mod HASH), idf as uint8/16, weights int8 × per-class scale, delta-varint, base64
  const b64 = (str) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const T = {}; for (let i = 0; i < 64; i++) T[A[i]] = i; str = str.replace(/=+$/, ''); const out = new Uint8Array(Math.floor(str.length * 3 / 4)); let o = 0, buf = 0, bits = 0; for (const ch of str) { buf = (buf << 6) | T[ch]; bits += 6; if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; } } return out; };
  const fnv = (x) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const CM_IDF = new Map(); const CM_INV = new Map();
  const CAT_KEYS = new Set(CM ? CM.classes.map(c => key(c.name)) : []);
  if (CM) {
    let u = b64(CM.idf), p = 0, b = 0;
    while (p < u.length) { let d = 0, sh = 0, x; do { x = u[p++]; d |= (x & 127) << sh; sh += 7; } while (x & 128); b += d; CM_IDF.set(b, u[p++] / 16); }
    CM.classes.forEach((c, ci) => { const q = b64(c.q); let p2 = 0, bk = 0; while (p2 < q.length) { let d = 0, sh = 0, x; do { x = q[p2++]; d |= (x & 127) << sh; sh += 7; } while (x & 128); bk += d; const v = q[p2++]; const w = (v > 127 ? v - 256 : v) * c.s; let l = CM_INV.get(bk); if (!l) CM_INV.set(bk, l = []); l.push(ci, w); } });
  }
  function catFeats(name) {
    const t = key(name).split(' ').filter(Boolean);
    const f = t.map(x => 'w:' + x);
    for (let j = 0; j + 1 < t.length; j++) f.push('b:' + t[j] + '_' + t[j + 1]);
    if (t.length) f.push('f:' + t[0]);
    return f;
  }
  function suggestCategory(name, k) {
    if (!CM || !String(name || '').trim()) return [];
    const H = CM.hash; const tf = new Map();
    const add = (bk) => { if (CM_IDF.has(bk)) tf.set(bk, (tf.get(bk) || 0) + 1); };
    for (const f of catFeats(name)) add(fnv(f) % H);
    for (const t of key(name).split(' ').filter(Boolean)) { const w = ' ' + t + ' '; for (const n of [3, 4]) for (let i = 0; i + n <= w.length; i++) add(H + fnv('c:' + w.slice(i, i + n)) % H); }
    if (!tf.size) { const t0 = key(name).split(' '); const pc = (LEARNED.prefix_cat || {})[t0.slice(0, 2).join(' ')] || (LEARNED.prefix_cat || {})[t0[0]]; const c = pc && CM.classes.find(x => x.name === pc); return c ? [{ name: c.name, id: c.id, p: 0.9 }] : []; }
    let nw = 0, nc = 0; const x = [];
    for (const [bk, n] of tf) { const v = (1 + Math.log(n)) * CM_IDF.get(bk); x.push([bk, v]); if (bk < H) nw += v * v; else nc += v * v; }
    nw = Math.sqrt(nw) || 1; nc = Math.sqrt(nc) || 1;
    const sc = CM.classes.map(c => c.b);
    for (const [bk, xv] of x) { const l = CM_INV.get(bk); if (!l) continue; const v = xv / (bk < H ? nw : nc); for (let q = 0; q < l.length; q += 2) sc[l[q]] += l[q + 1] * v; }
    const mx = Math.max(...sc); const z = sc.reduce((a, v) => a + Math.exp(v - mx), 0);
    let out = CM.classes.map((c, ci) => ({ name: c.name, id: c.id, p: Math.exp(sc[ci] - mx) / z }));
    // learned brand/lead-token memory ("Pharmacity …" → Nhà thuốc) outweighs the word model
    const t = key(name).split(' '); const pcat = (LEARNED.prefix_cat || {})[t.slice(0, 2).join(' ')] || (LEARNED.prefix_cat || {})[t[0]];
    if (pcat) out = out.map(c => ({ ...c, p: c.name === pcat ? 0.9 + 0.1 * c.p : 0.1 * c.p }));
    return out.sort((a, b) => b.p - a.p).slice(0, k || 3);
  }

  // ===================== RECORD =====================
  function checkRecord(rec) {
    const region = regionOf(rec.province);
    const st = checkStreet(rec.street, { region, house: rec.house_number });
    const streetForCtx = st.notStreet ? '' : st.fixed;
    let houseInput = rec.house_number;
    const ho = checkHouse(houseInput, { region, street: streetForCtx || rec.street, province: rec.province });
    // merge lane moved out of street field into house number
    let houseFixed = ho.fixed;
    if (st.moved) {
      const hk = key(houseFixed);
      const mk = key(st.moved);
      const nums = st.moved.match(/\d+/g) || [];
      const hasLane = /Ngõ|Ngách|Hẻm|Kiệt/.test(houseFixed);
      const rawPlainNum = /^\s*(số\s*|so\s*|no\.?\s*)?\d+[A-Za-z]?\s*$/i.test(String(rec.house_number || ''));
      const isLane = /^(Ngõ|Ngách|Hẻm|Kiệt)\s/i.test(st.moved);
      const sameNum = (st.moved.match(/\d+/) || [''])[0] === (houseFixed.match(/\d+/) || ['x'])[0];
      if (!hasLane && houseFixed && /^\d+[A-Za-z]?$/.test(houseFixed) && rawPlainNum && isLane && !sameNum) {
        const merged = checkHouse(houseFixed + ' ' + st.moved, { region, street: streetForCtx, province: rec.province });
        houseFixed = merged.fixed; ho.structure = merged.structure;
      } else if (!houseFixed) {
        const hm = checkHouse(st.moved, { region, street: streetForCtx });
        houseFixed = hm.fixed; ho.structure = hm.structure;
        if (/[A-Za-zĐđ]/.test(st.moved) && !/Ngõ|Ngách|Hẻm/.test(st.moved)) ho.findings.push({ code: 'A2.5', field: 'house', msg: 'Mã lô/toà đang nằm ở ô đường — chuyển về ô số nhà', level: 'L1', severity: 'warn' });
      }
      void hk; void mk; void nums;
    }
    const nm = checkName(rec.name, { street: streetForCtx || rec.street, category: rec.category, region });
    // category suggestion from the (corrected) name
    const catSug = suggestCategory(nm.fixed || rec.name, 3);
    const given = String(rec.category || '').trim();
    for (const f of nm.findings) if (f.code === 'P7.1' && catSug.length) { f.options = catSug.map(c => c.name); f.msg = `Chưa chọn loại địa điểm — gợi ý: ${catSug.map(c => c.name).join(', ')}`; f.level = 'L1'; }
    if (given && catSug.length && catSug[0].p >= 0.9 && key(catSug[0].name) !== key(given) && !catSug.slice(0, 3).some(c => key(c.name) === key(given)))
      nm.findings.push({ code: 'INFO', field: 'category', msg: `Loại địa điểm có thể là "${catSug[0].name}" (theo tên)`, level: 'L1', severity: 'warn', options: [catSug[0].name] });
    const findings = [...nm.findings, ...ho.findings, ...st.findings];
    return {
      region,
      name: { value: rec.name, fixed: nm.fixed, findings: nm.findings },
      house: { value: rec.house_number, fixed: houseFixed, findings: ho.findings, structure: ho.structure },
      street: { value: rec.street, fixed: st.notStreet ? null : st.fixed, findings: st.findings, moved: st.moved },
      category: { value: given, suggest: catSug },
      findings
    };
  }

  const CODEBOOK = {
    'P2.1': 'Place không có tên', 'P3.1': 'Ký tự lỗi, khoảng trắng, gạch nối', 'P3.2': 'Viết hoa sai', 'P3.3': 'Mất dấu', 'P3.4': 'Viết tắt',
    'P3.5': 'Thừa phần không phải tên', 'P3.6': 'Brand viết sai', 'P3.7': 'Tên không phải tên', 'P4.4': 'Tên chi nhánh lẫn vào brand',
    'P7.1': 'Không có category', 'P9.2': 'POI cha – con sai cấu trúc',
    'A1.3': 'Còn cấp quận/huyện', 'A2.1': 'Chuỗi ngõ dạng chữ chưa chuẩn', 'A2.2': 'Chuỗi gạch chéo nhiều cấp', 'A2.4': 'Viết tắt, dính chữ',
    'A2.5': 'Mã toà, căn, lô trong số nhà', 'A2.6': 'Tiền tố/hậu tố số nhà', 'A2.7': 'Sai field', 'A2.9': 'Sai quy ước miền',
    'A3.1': 'Tên phường/khu trong field đường', 'A3.3': 'Tên thành phố trong field đường', 'A3.4': 'KĐT/khu tập thể trong field đường',
    'A3.5': 'Toà/TTTM trong field đường', 'A3.6': 'Thôn/xóm/tổ dân phố trong field đường', 'A3.8': 'Giá trị giữ chỗ',
    'A6.1': 'Tiền tố loại đường', 'A6.2': 'Không dấu/tiếng Anh', 'A6.3': 'Hoa thường', 'A6.4': 'Unicode khác chuẩn', 'A6.5': 'Sai chính tả', 'A6.6': 'Rác đi kèm tên',
    'A8.6': 'Lỗi chính tả cấp ngõ/ngách', 'A9.4': 'Ngõ ở hai field mâu thuẫn', 'A11.1': 'Không có số nhà', 'A11.2': 'Không có đường', 'A11.4': 'Chỉ có ngõ, không số nhà',
    'A12.4': 'Mã bưu chính trong chuỗi'
  };

  const VERSION = '1.2.0';
  const api = { VERSION, LEARNED_META: LEARNED.meta || null, suggestCategory, checkName, checkHouse, checkStreet, checkRecord, regionOf, laneReading, CODEBOOK, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NamingEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
