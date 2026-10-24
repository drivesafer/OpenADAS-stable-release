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
  const LEARNED = /*__LEARNED__*/{"meta":{"trained_on":"all","records":3891},"lead_ok":["bach","bao","benh","buu","ca","cafe","chi","chung","cong","cua","dai","giat","goc","ha","he","hieu","hoc","khach","kinh","lug","mam","ngan","nha","oc","phan","phong","salon","san","sieu","tap","thap","thoi","tiem","tieu","toa","toc","tous","tram","trung","tuong"],"lead_title":["ao","banh","be","bia","buffet","bun","cat","cay","chao","che","co","com","cuu","ga","hai","hair","happy","hu","khu","lau","mien","pho","quan","spa","sua","the","thit","thuc","tokyo","tra","truong","van","vuon"],"brands":{"family mart":"FamilyMart","winmart":"WinMart+","miniso":"MINISO","cellphones":"CellphoneS","curry house coco":"Curry House CoCo","house coco":"House CoCo","house coco ichibanya":"House CoCo Ichibanya","coco":"CoCo","coco ichibanya":"CoCo Ichibanya","mykingdom":"MyKingdom","fuji mart":"FujiMart","vinbus":"VinBus","vinfast":"VinFast","atm vietinbank":"ATM VietinBank","vietinbank":"VietinBank","jins":"JINS","win mart":"WinMart","pizza 4ps":"Pizza 4P's","4ps":"4P's","pvcombank":"PVcomBank","vnpt":"VNPT","vnpt vinaphone":"VNPT VinaPhone","vinaphone":"VinaPhone","tocotoco":"TocoToco","pethealth":"PetHealth","pethealth vet":"PetHealth Vet","pethealth vet hospital":"PetHealth Vet Hospital","true money":"TrueMoney","asics":"ASICS","muji":"MUJI","canifa":"CANIFA","owndays":"OWNDAYS","chapanda":"ChaPanda","l angfarm":"L'angfarm","ftu":"FTU","lotte":"LOTTE","lotte mart":"LOTTE Mart","gogi":"GoGi","gogi house":"GoGi House","uni qlo":"UNIQLO","levis":"Levi's","anta":"ANTA"},"streets":{"le duc tho":"Đường Lê Đức Thọ","cau noi":"Đường Cầu Noi","lang":"Đường Láng","do duc duc":"Phố Đỗ Đức Dục","le van luong":"Đường Lê Văn Lương","hong do":"Phố Hồng Đô","duy tan":"Phố Duy Tân","le thanh nghi":"Phố Lê Thanh Nghị","nguyen khang":"Đường Nguyễn Khang","pham hung":"Đường Phạm Hùng","tram":"Phố Trạm","me tri ha":"Phố Mễ Trì Hạ","hoang tich tri":"Phố Hoàng Tích Trí","le tran can":"Đường Lê Trần Cấn","cua bac":"Phố Cửa Bắc","nguyen the ruc":"Phố Nguyễn Thế Rục","ngo duc ke":"Đường Ngô Đức Kế","cau giay":"Đường Cầu Giấy","diamond":"Đường Diamond","hoang dao thuy":"Phố Hoàng Đạo Thúy","thuy khue":"Đường Thụy Khuê","vo van tan":"Đường Võ Văn Tần","khuat duy tien":"Đường Khuất Duy Tiến","pham hong thai":"Đường Phạm Hồng Thái","nguyen van ngoc":"Phố Nguyễn Văn Ngọc","nguyen van cu":"Đường Nguyễn Văn Cừ","d8":"Đường D8","hang vai":"Phố Hàng Vải","bach mai":"Phố Bạch Mai","kim ma":"Phố Kim Mã","ngo quyen":"Đường Ngô Quyền","vo thi sau":"Phố Võ Thị Sáu","van xuan":"Đường Vạn Xuân","kim giang":"Đường Kim Giang","minh khai":"Phố Minh Khai","doi can":"Phố Đội Cấn","phu doan":"Phố Phủ Doãn","nguyen huu canh":"Đường Nguyễn Hữu Cảnh","vo chi cong":"Đường Võ Chí Công","nguy nhu kon tum":"Phố Ngụy Như Kon Tum","tran vy":"Phố Trần Vỹ","muong dan hoai":"Đường Mương Đan Hoài","tran van lai":"Phố Trần Văn Lai","khuong ha":"Phố Khương Hạ","chua lang":"Phố Chùa Láng","tran thai tong":"Phố Trần Thái Tông","cua dong":"Phố Cửa Đông","trung hoa":"Phố Trung Hoà","le trong tan":"Đường Lê Trọng Tấn","hung vuong 1":"Đường Hùng Vương 1","au lac 2":"Đường Âu Lạc 2","tran dai nghia":"Phố Trần Đại Nghĩa","nguyen hoang":"Phố Nguyễn Hoàng","me tri":"Đường Mễ Trì","dien bien phu":"Đường Điện Biên Phủ","van lang 2":"Đường Văn Lang 2","nguyen huu huan":"Phố Nguyễn Hữu Huân","nguyen trung ngan":"Đường Nguyễn Trung Ngạn","dinh cong":"Phố Định Công","hoang trong mau":"Phố Hoàng Trọng Mậu","pham huy thong":"Phố Phạm Huy Thông","nguyen co thach":"Phố Nguyễn Cơ Thạch","nguyen trai":"Đường Nguyễn Trãi","ho tung mau":"Đường Hồ Tùng Mậu","dinh thon":"Đường Đình Thôn","vu trong phung":"Đường Vũ Trọng Phụng","pham van dong":"Đường Phạm Văn Đồng","me tri thuong":"Phố Mễ Trì Thượng","hoang hoa tham":"Đường Hoàng Hoa Thám","nhon":"Phố Nhổn","bat phuc":"Đường Bát Phúc","nguyen huu lieu":"Đường Nguyễn Hữu Liêu","y lan":"Đường Ỷ Lan","tran kim xuyen":"Phố Trần Kim Xuyến","vu tong phan":"Phố Vũ Tông Phan","nguyen chi thanh":"Đường Nguyễn Chí Thanh","dai tu":"Đường Đại Tự","thanh nhan":"Phố Thanh Nhàn","nguyen huy tuong":"Phố Nguyễn Huy Tưởng","co nhue":"Đường Cổ Nhuế","luong dinh cua":"Phố Lương Định Của","phung khoang":"Đường Phùng Khoang","nhue giang":"Đường Nhuệ Giang","hang buom":"Phố Hàng Buồm","nha tho":"Phố Nhà Thờ","hoang quoc viet":"Đường Hoàng Quốc Việt","do dinh thien":"Phố Đỗ Đình Thiện","cach mang thang tam":"Đường Cách Mạng Tháng Tám","pham van nghi":"Đường Phạm Văn Nghị","yen vinh":"Đường Yên Vĩnh","ton that thiep":"Phố Tôn Thất Thiệp","dai co viet":"Đường Đại Cồ Việt","chau van liem":"Đường Châu Văn Liêm","thien hien":"Phố Thiên Hiền","vu pham ham":"Phố Vũ Phạm Hàm","tran duy hung":"Đường Trần Duy Hưng","ha noi":"Đường Hà Nội","nguyen van luyen":"Phố Nguyễn Văn Luyện","lac long quan":"Đường Lạc Long Quân","tan xuan":"Đường Tân Xuân","lan ong":"Phố Lãn Ông","tran trong kim":"Đường Trần Trọng Kim","ha huy tap":"Đường Hà Huy Tập","duong dinh nghe":"Phố Dương Đình Nghệ","bat trang":"Đường Bát Tràng","tran quoc toan":"Phố Trần Quốc Toản","hang than":"Phố Hàng Than","to hieu":"Phố Tô Hiệu","hung vuong":"Đường Hùng Vương","phu do":"Phố Phú Đô","d4":"Đường D4","hoang cong chat":"Đường Hoàng Công Chất","ngo van nam":"Đường Ngô Văn Năm","tran dien":"Phố Trần Điền","vo nguyen giap":"Đường Võ Nguyên Giáp","doc lap":"Đường Độc Lập","hai ba trung":"Đường Hai Bà Trưng","ngoc thuy":"Đường Ngọc Thụy","duong noi":"Đường Dương Nội","dai viet":"Đường Đại Việt","nguyen ngoc vu":"Đường Nguyễn Ngọc Vũ","thien phuc":"Đường Thiên Phúc","ton that thuyet":"Phố Tôn Thất Thuyết","duong quang ham":"Phố Dương Quảng Hàm","mai thi luu":"Đường Mai Thị Lựu","hang bai":"Phố Hàng Bài","dai viet 2":"Đường Đại Việt 2","van hoa 4":"Đường Vạn Hoa 4","hoang cau":"Phố Hoàng Cầu","mieu dam":"Phố Miếu Đầm","trung kinh":"Phố Trung Kính","dong quan":"Phố Đông Quan","tinh 422":"Đường tỉnh 422","hoang sa":"Đường Hoàng Sa","la thanh":"Đường La Thành","tinh 478b":"Đường tỉnh 478B","nguyen dong chi":"Phố Nguyễn Đổng Chi","au lac":"Đường Âu Lạc","dich vong hau":"Phố Dịch Vọng Hậu","nguyen quoc tri":"Phố Nguyễn Quốc Trị","pham tuan tai":"Phố Phạm Tuấn Tài","phu dien":"Đường Phú Diễn","hang gai":"Phố Hàng Gai","nguyen hue":"Đường Nguyễn Huệ","dong bat":"Phố Đồng Bát","ngoc hoi":"Đường Ngọc Hồi","gia ngu":"Phố Gia Ngư","do nha":"Phố Do Nha","quang trung":"Phố Quang Trung","chan cam":"Phố Chân Cầm","song nhue":"Đường Sông Nhuệ","an duong vuong":"Đường An Dương Vương","chinh kinh":"Phố Chính Kinh","van phuc":"Phố Vạn Phúc","giang vo":"Phố Giảng Võ","van bao":"Phố Vạn Bảo","tran nhat duat":"Đường Trần Nhật Duật","truong chinh":"Đường Trường Chinh","tran quoc hoan":"Phố Trần Quốc Hoàn","dong me":"Phố Đồng Me","tinh 419":"Đường tỉnh 419","linh thuong":"Đường Linh Thượng","thanh thai":"Phố Thành Thái","ham nghi":"Phố Hàm Nghi","yersin":"Đường Yersin","ngo dat dung":"Đường Ngô Đạt Dụng","to ngoc van":"Đường Tô Ngọc Vân","cao lo":"Đường Cao Lỗ","tran binh":"Phố Trần Bình","trung van 3":"Đường Trung Văn 3","nguyen khanh toan":"Đường Nguyễn Khánh Toàn","tu hoa":"Phố Từ Hoa","ly nam de":"Phố Lý Nam Đế","tran hung dao":"Đường Trần Hưng Đạo","au lac 3":"Đường Âu Lạc 3","hang bac":"Phố Hàng Bạc","xuan thuy":"Đường Xuân Thủy","nguyen van giap":"Đường Nguyễn Văn Giáp","ly anh tong":"Phố Lý Anh Tông","hung vuong keo dai":"Đường Hùng Vương Kéo Dài","phan dinh phung":"Phố Phan Đình Phùng","ngo gia tu":"Đường Ngô Gia Tự","tan lap":"Đường Tân Lập","xuan dieu":"Đường Xuân Diệu","nguyen van troi":"Đường Nguyễn Văn Trỗi","tung thien vuong":"Đường Tùng Thiện Vương","vo truong toan":"Đường Võ Trường Toản","phuoc thien":"Đường Phước Thiện","tinh 334":"Đường tỉnh 334","le quang dao":"Đường Lê Quang Đạo","ong ich khiem":"Phố Ông Ích Khiêm","nguyen thi thap":"Phố Nguyễn Thị Thập","nguyen chanh":"Phố Nguyễn Chánh","nguyen thai hoc":"Phố Nguyễn Thái Học","ha hoi":"Đường Hạ Hội","le thanh ton":"Đường Lê Thánh Tôn","nghia tan":"Phố Nghĩa Tân","nguyen van linh":"Đường Nguyễn Văn Linh","pham tu":"Đường Phạm Tu","dang tien dong":"Phố Đặng Tiến Đông","ly quoc su":"Phố Lý Quốc Sư","cau go":"Phố Cầu Gỗ","xom":"Phố Xốm","van con":"Đường Vân Côn","son tay":"Phố Sơn Tây","d1":"Đường D1","tran thu do":"Phố Trần Thủ Độ","tay son":"Phố Tây Sơn","vanh dai 3 5":"Đường Vành Đai 3.5","do gia":"Đường Đỗ Gia","phan ke binh":"Phố Phan Kế Bính","da ton 10":"Đường Đa Tốn 10","thai ha":"Phố Thái Hà","le quy don":"Phố Lê Quý Đôn","vuong thua vu":"Phố Vương Thừa Vũ","van tien dung":"Đường Văn Tiến Dũng","van lang":"Đường Văn Lang","trang an":"Đường Tràng An","ha mo tan hoi":"Đường Hạ Mỗ - Tân Hội","nguyen thanh binh":"Phố Nguyễn Thanh Bình","ngoc dai":"Đường Ngọc Đại","hang da":"Phố Hàng Da","phan xich":"Đường Phan Xích","galaxy 5":"Đường Galaxy 5","hau giang":"Đường Hậu Giang","lieu giai":"Phố Liễu Giai","au lac 4":"Đường Âu Lạc 4","do xuan hop":"Phố Đỗ Xuân Hợp","ha dinh":"Phố Hạ Đình","pho duc chinh":"Phố Phó Đức Chính","nguyen binh khiem":"Đường Nguyễn Bỉnh Khiêm","thai thinh":"Phố Thái Thịnh","vu quynh":"Phố Vũ Quỳnh","vong thi":"Phố Võng Thị","de phu o":"Đường Đê Phú Ổ","kenh giua":"Đường Kênh Giữa","dinh nup":"Phố Đinh Núp","foresa 1":"Đường Foresa 1","pham van bach":"Phố Phạm Văn Bạch","lac trung":"Phố Lạc Trung","lang ha":"Phố Láng Hạ","tran phu":"Đường Trần Phú","tuyen 12":"Đường Tuyến 12","dich vong":"Phố Dịch Vọng","phan tay nhac":"Phố Phan Tây Nhạc","tam coc":"Đường Tam Cốc","van cao":"Đường Văn Cao","tu mo":"Phố Tú Mỡ","duc thuong":"Đường Đức Thượng","tran tu binh":"Phố Trần Tử Bình","mac thai to":"Phố Mạc Thái Tổ","ngoc dong":"Đường Ngọc Động","ngoc ha":"Phố Ngọc Hà","ton quang phiet":"Phố Tôn Quang Phiệt","phung chi kien":"Phố Phùng Chí Kiên","luu huu phuoc":"Phố Lưu Hữu Phước","nguyen huu an":"Phố Nguyễn Hữu An","dao duy anh":"Phố Đào Duy Anh","bac lai xa":"Đường Bắc Lai Xá","khuc thua du":"Phố Khúc Thừa Dụ","mac thai tong":"Phố Mạc Thái Tông","phan van truong":"Phố Phan Văn Trường","nguyen xuan khoat":"Phố Nguyễn Xuân Khoát","van hoa 3":"Đường Vạn Hoa 3","trieu quoc dat":"Phố Triệu Quốc Đạt","hang ngang":"Phố Hàng Ngang","quan nhan":"Phố Quan Nhân","phuong canh":"Đường Phương Canh","huynh thuc khang":"Phố Huỳnh Thúc Kháng","phuong mai":"Phố Phương Mai","nguyen xien":"Đường Nguyễn Xiển","kieu mai":"Phố Kiều Mai","le duan":"Đường Lê Duẩn","van son":"Đường Văn Sơn","nguyen thanh son":"Đường Nguyễn Thanh Sơn","lien tinh tru huu cu":"Đường liên tỉnh Trù Hựu cũ","luong van thang":"Đường Lương Văn Thăng","kim ngoc":"Đường Kim Ngọc","nguyen dinh chieu":"Đường Nguyễn Đình Chiểu","ho hoan kiem":"Phố Hồ Hoàn Kiếm","cho lon":"Đường Chợ Lớn","khuyen luong":"Đường Khuyến Lương","tran dang ninh":"Phố Trần Đăng Ninh","dang van ngu":"Phố Đặng Văn Ngữ","le phung hieu":"Phố Lê Phụng Hiểu","thu y":"Phố Thú Y","xuan phuong":"Đường Xuân Phương","violet 3":"Đường Violet 3","trinh van bo":"Phố Trịnh Văn Bô","dinh cong trang":"Phố Đinh Công Tráng","binh phu":"Đường Bình Phú","buoi":"Đường Bưởi","nguyen phong sac":"Đường Nguyễn Phong Sắc","lo voi":"Đường Lò Vôi","phung hung":"Đường Phùng Hưng","ton duc thang":"Đường Tôn Đức Thắng","trich sai":"Phố Trích Sài","ngo van canh":"Đường Ngô Văn Cảnh","cau dien":"Đường Cầu Diễn","tho nhuom":"Phố Thợ Nhuộm","hang ga":"Phố Hàng Gà","trung yen 15":"Đường Trung Yên 15","hoa phuong":"Đường Hoa Phượng","tay mo":"Đường Tây Mỗ","thuy hoi":"Đường Thúy Hội","ngoc khanh":"Phố Ngọc Khánh","luong the vinh":"Đường Lương Thế Vinh","bach dang":"Đường Bạch Đằng","nguyen khoai":"Đường Nguyễn Khoái","le loi":"Đường Lê Lợi","ho xuan huong":"Phố Hồ Xuân Hương","huy du":"Phố Huy Du","dong hoi":"Đường Đông Hội","dai duong 9":"Đường Đại Dương 9","cuu quan":"Đường Cựu Quán","huu hung":"Đường Hữu Hưng","tran nhan tong":"Phố Trần Nhân Tông","my dinh":"Đường Mỹ Đình","tran huu duc":"Phố Trần Hữu Dực","nguyen tuan":"Đường Nguyễn Tuân","dang chat":"Đường Đặng Chất","cua quan":"Phố Cửa Quán","dh06":"Đường ĐH06","cong xa paris":"Đường Công xã Paris","thon ha":"Đường Thôn Hạ","trung liet":"Phố Trung Liệt","an khanh":"Đường An Khánh","nguyen dinh thi":"Phố Nguyễn Đình Thi","hoang tung":"Đường Hoàng Tùng","kim chung":"Đường Kim Chung","d9":"Đường D9","vien":"Phố Viên","giang van minh":"Phố Giang Văn Minh","nguyen thi due":"Đường Nguyễn Thị Duệ","doan ke thien":"Phố Doãn Kế Thiện","hang manh":"Phố Hàng Mành","pham ngoc thach":"Phố Phạm Ngọc Thạch","quach nhan":"Đường Quách Nhẫn","cho gom":"Đường Chợ Gốm","tong tat thang":"Phố Tống Tất Thắng","dh04":"Đường DH04","au co":"Đường Âu Cơ","dinh tien hoang":"Phố Đinh Tiên Hoàng","thuong dinh":"Phố Thượng Đình","phu luong":"Phố Phú Lương","phuong quan":"Đường Phương Quan","d7":"Đường D7","ho sen":"Đường Hồ Sen","le thai to":"Phố Lê Thái Tổ","vo van kiet":"Đường Võ Văn Kiệt","nguyen cong hoan":"Phố Nguyễn Công Hoan","khuong trung":"Phố Khương Trung","tran quoc vuong":"Phố Trần Quốc Vượng","dao duy tu":"Đường Đào Duy Từ","hoang ngan":"Phố Hoàng Ngân","dinh le":"Phố Đinh Lễ","song hanh":"Đường Song Hành","bui huy bich":"Phố Bùi Huy Bích","le van linh":"Phố Lê Văn Linh","le van thiem":"Phố Lê Văn Thiêm","hoa bang":"Phố Hoa Bằng","chua but moc":"Đường Chùa Bụt Mọc","thien nga 3":"Đường Thiên Nga 3","giap nhat":"Phố Giáp Nhất","hoang tang bi":"Đường Hoàng Tăng Bí","b2":"Đường B2","kim ma thuong":"Phố Kim Mã Thượng","san ho":"Đường San Hô","quan hoa":"Phố Quan Hoa","duong dinh nghe keo dai":"Phố Dương Đình Nghệ kéo dài","duong khue":"Phố Dương Khuê","tinh 378":"Đường tỉnh 378","nguyen dinh hoan":"Phố Nguyễn Đình Hoàn","nguyen chinh":"Phố Nguyễn Chính","ba trieu":"Phố Bà Triệu","luong ngoc quyen":"Phố Lương Ngọc Quyến","linh nam":"Đường Lĩnh Nam","nguyet que":"Đường Nguyệt Quế","dinh dien":"Đường Đinh Điền","nguyen van huyen":"Đường Nguyễn Văn Huyên","dao tan":"Phố Đào Tấn","duc tu":"Đường Dục Tú","dong moi":"Đường Đồng Mới","bao khanh":"Phố Báo Khánh","nguyen hoang ton":"Đường Nguyễn Hoàng Tôn","hoang quan chi":"Phố Hoàng Quán Chi","nguyen tri phuong":"Đường Nguyễn Tri Phương","hong ha":"Đường Hồng Hà","mac thi buoi":"Đường Mạc Thị Bưởi","cao ba quat":"Phố Cao Bá Quát","phuong trach":"Đường Phương Trạch","hang dau":"Phố Hàng Dầu","tuyen 2":"Đường Tuyến 2","dai la":"Phố Đại La","nguyen nhu uyen":"Phố Nguyễn Như Uyên","tru huu":"Đường Trù Hựu","ngu xa":"Phố Ngũ Xã","ngo gia kham":"Phố Ngô Gia Khảm","nguyen thi dinh":"Phố Nguyễn Thị Định","van don":"Đường Vân Đồn","khuong dinh":"Đường Khương Đình","nguyen hong":"Phố Nguyên Hồng","violet 1":"Đường Violet 1","hoang cau moi":"Đường Hoàng Cầu Mới","tran nguyen han":"Phố Trần Nguyên Hãn","mai anh tuan":"Phố Mai Anh Tuấn","tan phong":"Phố Tân Phong","hang cot":"Phố Hàng Cót","hoang lien":"Phố Hoàng Liên","vanh dai 1":"Đường Vành đai 1","lac nghiep":"Phố Lạc Nghiệp","thach cau":"Phố Thạch Cầu","to huu":"Phố Tố Hữu","hang be":"Phố Hàng Bè","nhan hoa":"Phố Nhân Hòa","dong soi":"Phố Đồng Sợi","trieu khuc":"Phố Triều Khúc","ninh hiep":"Đường Ninh Hiệp","le hong phong":"Phố Lê Hồng Phong","van hoa":"Đường Văn Hóa","cao toc ha noi lao cai":"Đường cao tốc Hà Nội - Lào Cai","khu 1":"Đường Khu 1","quang tien":"Đường Quang Tiến","van tan":"Phố Văn Tân","ai mo":"Phố Ái Mộ","vu ngoc phan":"Phố Vũ Ngọc Phan","van lang 4":"Đường Văn Lang 4","linh lang":"Phố Linh Lang","cau kenh":"Đường Cầu Kênh","bui xuong trach":"Phố Bùi Xương Trạch","dong khoi":"Đường Đồng Khởi","thanh cong":"Phố Thành Công","trung van":"Đường Trung Văn","tran nao":"Đường Trần Não","vinh hung":"Phố Vĩnh Hưng","nguyen xa":"Phố Nguyên Xá","dong bat a":"Đường Đồng Bát A","cum truong":"Đường Cụm Trường","nguyen van loc":"Phố Nguyễn Văn Lộc","phan ba vanh":"Đường Phan Bá Vành","mac dinh chi":"Phố Mạc Đĩnh Chi","vinh phuc":"Phố Vĩnh Phúc","hai au":"Đường Hải Âu","to vinh dien":"Phố Tô Vĩnh Diện","quang an":"Phố Quảng An","vu huu":"Phố Vũ Hữu","nguyen du":"Phố Nguyễn Du","anh dung":"Đường Anh Dũng","tan phu":"Đường Tân Phú","cau coc":"Phố Cầu Cốc","cat thue":"Đường Cát Thuế","tran quy kien":"Phố Trần Quý Kiên","viet hung":"Phố Việt Hưng","lac hong":"Đường Lạc Hồng","van noi":"Đường Văn Nội","ton that dam":"Đường Tôn Thất Đạm","luu quang vu":"Phố Lưu Quang Vũ","yen ninh":"Phố Yên Ninh","ta quang buu":"Phố Tạ Quang Bửu","nguyen quy duc":"Phố Nguyễn Quý Đức","tran quoc thao":"Đường Trần Quốc Thảo","ton that tung":"Phố Tôn Thất Tùng","trang tien":"Phố Tràng Tiền","cau buou":"Đường Cầu Bươu","co dien":"Đường Cổ Điển","kim nguu":"Phố Kim Ngưu","vu nam long":"Phố Vũ Nam Long","tay tuu":"Đường Tây Tựu","hoang van thu":"Đường Hoàng Văn Thụ","foresa 8a":"Đường Foresa 8A","den van hien":"Đường Đền Văn Hiến","hai boi 2":"Đường Hải Bối 2","thanh nien":"Đường Thanh Niên","pham than duat":"Phố Phạm Thận Duật","tan hoi":"Đường Tân Hội","khuc hao":"Phố Khúc Hạo","ngoc lam":"Phố Ngọc Lâm","ngo thi nham":"Phố Ngô Thì Nhậm","thuy linh":"Phố Thúy Lĩnh","lo duc":"Phố Lò Đúc","nui truc":"Phố Núi Trúc","gia quat":"Phố Gia Quất","hang mam":"Phố Hàng Mắm","quoc tu giam":"Phố Quốc Tử Giám","nguyen phuc nguyen":"Đường Nguyễn Phúc Nguyên","hao nam":"Phố Hào Nam","quyet tien":"Đường Quyết Tiến","cua nam":"Phố Cửa Nam","duc dien":"Đường Đức Diễn","nguyen cong tru":"Phố Nguyễn Công Trứ","chua dong":"Đường Chùa Đông","truong cong giai":"Phố Trương Công Giai","mai dich":"Phố Mai Dịch","da ton":"Đường Đa Tốn","lam van ben":"Đường Lâm Văn Bền","cao toc ha noi hai phong":"Đường cao tốc Hà Nội - Hải Phòng","d6":"Đường D6","cat linh":"Phố Cát Linh","moc lan":"Đường Mộc Lan","nguyen kha trac":"Phố Nguyễn Khả Trạc","an trach":"Phố An Trạch","khuong thuong":"Phố Khương Thượng","nguyen bac":"Đường Nguyễn Bặc","ho loc vuong":"Đường Hồ Lộc Vượng","nguyen khac nhu":"Phố Nguyễn Khắc Nhu","cuong kien":"Phố Cương Kiên","ta hien":"Đường Tạ Hiện","dong tac":"Phố Đông Tác","chau long":"Phố Châu Long","dai phung i":"Đường Đại Phùng I","moc hoan":"Đường Mộc Hoàn","dai viet 4":"Đường Đại Việt 4","phan huy ich":"Phố Phan Huy Ích","chu van an":"Phố Chu Văn An","phuc dien":"Đường Phúc Diễn","vuon cam":"Phố Vườn Cam","ly bon":"Phố Lý Bôn","trung yen 8":"Phố Trung Yên 8","thanh binh":"Đường Thanh Bình","nguyen gia tri":"Đường Nguyễn Gia Trí","cay gao ba de":"Đường Cây Gạo Ba Đê","nguyen thiep":"Phố Nguyễn Thiếp","vu trong khanh":"Đường Vũ Trọng Khánh","nguyen khuyen":"Phố Nguyễn Khuyến","vong ho suoi cam":"Đường Vòng Hồ Suối Cam","ho cong du":"Đường Hồ Công Dự","duong tau":"Phố Đường Tầu"},"non_streets":{"khu tt1":"A3.4","h1 tm08 h0pe long bien":"A3.5","thon lai xa":"A3.6","khu a geleximco":"A3.4","aeon mall ha dong":"A3.5","quan thanh ward":"A3.1","vinhomes central park thanh my tay ho chi minh":"A3.4","duong kdt ciputra":"A3.4","kdt the manor":"A3.4","toa s2 01":"A3.5","vinhome greenbay":"A3.4","trung tam trien lam quoc gia 8brs":"A3.5","thon phu o":"A3.6","2qq2 j9":"A3.8","khu trung tam thuong mai aeon mall":"A3.5","tt4":"A3.4","van con an khanh":"A3.6","trung tam 75 tenement":"A3.4","vinhomes smart city":"A3.4","ngo 32 thon phung thuong 8":"A3.6","kdt nam trung yen":"A3.4","tt04":"A3.4","moc hoan an khanh ha noi":"A3.6","thon chien 1":"A3.6","vinhomes tan cang":"A3.4","thach hoa":"A3.1","my dinh song da":"A3.4","bt2":"A3.4","cong vien vo thi sau":"A3.8","kdt moi dai kim":"A3.4","hanoi city":"A3.3","the snow coffee branch":"A3.8","duong noi khu":"A3.8","kdt ciputra phu thuong ha noi":"A3.4","vinhomes smart city the canopy harmony area lobby":"A3.4","khu do thi me tri ha":"A3.4","24 thon noi 3":"A3.6","ngo 3 khu tap the trung tam 75":"A3.4","khu do thi cao cap ao tien van don quang ninh":"A3.4","vong xoay mac thai to nguyen quoc tri":"A3.8","duong noi khu d capitale":"A3.4","khu do thi hinedo":"A3.4","55 doi 6":"A3.6","landmark 81":"A3.5","phu o hamlet":"A3.6","to dan pho hoang van thu":"A3.6","lo bt04 05 khu 2 55 ha":"A3.4","khu do thi hinode":"A3.4","son dong crossroads":"A3.8","mizuki flora apartment":"A3.4","keangnam landmark pham hung":"A3.5","xv5v 758":"A3.8","tt3 vov":"A3.4","lai xa":"A3.6","duong noi khu giai doan 2 ecopark":"A3.8","quyet thang an khanh":"A3.6","khu do me tri ha":"A3.4","co nhue 1":"A3.1","the sun":"A3.4","khu dan cu hoang van thu":"A3.6","binh phu commune":"A3.1","pho am thuc keangnam":"A3.5","nam an khanh":"A3.4","ban lac 1":"A3.6","kdt me tri ha":"A3.4","quang ninh":"A3.3","du an nguyen ngoc":"A3.4","tai thi tran trau quy":"A3.1","tttm the garden":"A3.5","thon moc hoan an khanh":"A3.6","lo 103 my dinh 1":"A3.4","cum 7":"A3.6","tt1 06":"A3.4","khu do thi my dinh":"A3.4","ct1 number one":"A3.5","vinhomes gardenia":"A3.4","geleximco a":"A3.4","xom coc a2":"A3.6","moc hoan an khanh":"A3.6","toa ct3 2":"A3.5","tay mo va dai mo":"A3.1","van lam":"A3.6","ban lac":"A3.6","bui xa":"A3.6","khong ten":"A3.8","l13 14 q01 khu do thi":"A3.4","hinode":"A3.5","park 5":"A3.5","xom dan vang thon noi":"A3.6","khu chuc nang do thi thanh pho xanh":"A3.4","thon noi 1":"A3.6","duong noi khu tap the vinh phuc":"A3.4","thon noi 2":"A3.6","chung cu chelsea park":"A3.4","2nd floor":"A3.8","aeon mall ha dong duong noi":"A3.5","times city residence":"A3.4","lien ke 2":"A3.4","kdt tan tay do":"A3.4","day c8":"A3.5","khu do thi hinode royal park":"A3.4","so 4 ngo 177 duc thuong hoai duc ha noi":"A3.1","de":"A3.8","ngoc khanh sub area":"A3.1","quyet tien an khanh":"A3.6","vinhomes central park":"A3.4","duong kdt nam thang long":"A3.4","my dinh 1 ward":"A3.1","baya store":"A3.8","canh ben xe my dinh":"A3.8","vinhomes smartcity":"A3.4","ngo 267 duc thuong":"A3.1","toa nha ct9 sudico song da":"A3.5","san tap lai xe trong khoa co dien hoc vien nong nghiep":"A3.5","khu a geleximco thien phuc":"A3.4","khu biet thu thien":"A3.4","the garden shopping center me tri":"A3.5","vincom center nguyen chi thanh":"A3.5","tdp kien thanh gia lam ha noi":"A3.6","nhan my":"A3.6","to dan pho so 4":"A3.6","yen vinh hoai duc ha noi":"A3.6","khu ecopark":"A3.4","di trach":"A3.6","ha mo tan hoi xom le":"A3.6","phu o tay phuong ha noi":"A3.6","toa nha minh truong me tri":"A3.5","ban lac ha cong thai":"A3.6","xwjr xrr":"A3.8","yen hoa":"A3.1","2w4m r29":"A3.8","toa ct5 d me tri ha":"A3.5","so nha 77 79 thuong coc phuc tho ha noi":"A3.6","dai mo vinhomes park":"A3.4","khu san ho":"A3.4","ho cau song day van con an khanh":"A3.6","duong lang van con":"A3.6","apartment song da my dinh residence":"A3.4","cho com":"A3.5","khu indochine boutique":"A3.4","kdt vinhomes gardenia":"A3.4","son dong":"A3.1","hai au 1":"A3.4","vti building":"A3.5","tdp tan tay do":"A3.6","thon noi 3":"A3.6"},"wards":["an dong","ba dinh","bac giang","ban co","ben thanh","binh hung","bo de","cat lai","chanh hung","cho quan","chu","dai mo","dai thanh","dan phuong","dien hong","dong anh","dong da","dong ngac","gia lam","ha dong","ha giang 2","ha long","hai duong","hiep binh","hoa hung","hoa lac","hoa lu","hoai duc","hoan kiem","hoang liet","hoang mai","hong bang","hung dao","huong son","hy cuong","kien hung","kim anh","kim lien","le chan","long bien","long binh","long truong","luong son","mai chau","mai ha","meo vac","nam cam ranh","nam dinh","nam hoa lu","nam ly","nenh","nghia do","nguyen luong bang","nhieu loc","noi bai","o cho dua","o dien","pho hien","phu dinh","phu dong","phu lam","phu nhuan","phu thuong","phuc loi","phuc tho","phung cong","phuoc long","phuong liet","quang minh","sai gon","son dong","tan dinh","tan hung","tan my","tan tien","tay ho","tay hoa lu","tay phuong","thanh liet","thanh my tay","thanh tri","thanh xuan","thien loc","thu duc","thu lam","thuong cat","tran lam","tu liem","tu son","tuong mai","van giang","van mieu quoc tu giam","vinh thanh","vinh tuy","vu phuc","vuon lai","xuan dinh","xuan hoa","y yen","yen hoa","yen my","yen nghia","yen so"],"parents":["Bệnh viện Phụ sản Trung ương","Bệnh viện Đại học Phenikaa","Công viên Mễ Trì Hạ","Công viên Trung Tâm Vinhomes Smart City","Công viên Trung tâm","Dalat Mart","Ehomes Nam Sài Gòn","GO! Thăng Long","Ga Nội Bài","Hateco Green Park","Haven Park","Highlands Coffee","Học viện Nông nghiệp Việt Nam","IPAM DSTATION","Imperia","Imperia Smart City","Khu đô thị Hinode Royal Park","Khu đô thị Mễ Trì","Khu đô thị Mễ Trì Hạ","Khu đô thị Văn Phú","Kids Plaza","Lumi Hà Nội","Lumiere Evergreen","Masteri","Mizuki Park","Mễ Trì Hạ","Nhà thuốc Long Châu","Pharmacity","Phân khu Masteri","Phân khu Sakura","Phở Cao Gia","Pingu's English","Rose Town","The Cake Lab","The Sola Park","The Vesta","The Vesta Phú Lãm","Thủy Anh Fruits","Times City","Trường Lô Mô Nô Xốp","Trường Đại học Kinh tế","Trường Đại học Ngoại ngữ","Trường Đại học Ngoại thương","VinUni","Vinhomes Gardenia","Vinhomes Skylake","Vinhomes Smart City","Vinhomes Times City","a.SENSE Beauty & Spa","Đại học Kinh tế Quốc dân","Đại học Quốc gia Hà Nội"],"generic_names":["bai tong kho","barber shop","buffe quoc te","buffet","bun bo hue","ca phe mang di","che thap cam","com binh dan","com nieu tu chon","craft beer","cua hang shop","dich vu cam do","duong lac long quan","ga chien han quoc","giat kho giat la","giat say quan ao","goi dau noi mi","hair salo","ho dieu hoa","khu nha tro","korean bbq","lau nuong bbq","long lon tiet canh","me tri","mien luon","mini mart","mon trung han","nha biet thu","nha hang","nha hang nuong bbq","nha rieng","nha tro","private pharmacy","rua xe","san truot patin","stationery","sua chua phan cung","thit xien nuong","tiem cat toc nam","tiem photocopy","tiem toc nam","ton that hiep","tong hop kim khi","tram sac xe dien","xet nghiem tai nha"],"places":["24t3 thanh xuan complex","aeon ha dong","aeon mall ha dong","an dong","an duong vuong","an khanh","an phu","ba dinh","bac giang","ban co","ben thanh","binh hung","binh phu","bo de","cat lai","cau dien","cau giay","chan cam","chanh hung","charmvit tower","chi nhanh 2","chi nhanh cau giay","chi nhanh hoai duc","chi nhanh thanh xuan","cho quan","chua lang","cmc tower","co so 12","co so 2","co so 3","co so 9","cua dong","dai hoc su pham","dai mo","dai thanh","dan phuong","dich vong hau","dien hong","dinh nup","doan ke thien","doi can","dong anh","dong da","dong khoi","dong ngac","duong lang","duong quang ham","duong so 14","duy tan","fivimart my dinh","flc complex","gardenia","gia lam","go hung yen","go thang long","golden field","golden palace","green bay","greenbay","ha dong","ha dong yen nghia","ha giang 2","ha long","hai ba trung","hai duong","ham nghi","handico","hang buom","hang than","hanoi branch","hau giang","hiep binh","ho guom","hoa bang","hoa hung","hoa lac","hoa lu","hoai duc","hoan kiem","hoang liet","hoang mai","hoang quoc viet","hoi so","hong bang","hong do","hung dao","hung vuong","hung vuong bac giang","huong son","huynh thuc khang","hy cuong","indochina plaza","indochina plaza ha noi","iph cau giay","keangnam","kien hung","kim anh","kim lien","kim ma","landmark 3","landmark 4","landmark 72","landmark 81","landmark plus","lang ha","le chan","le duc tho","le quang dao","le thanh nghi","le thanh ton","le van luong","le van thiem","lieu giai","lo duc","long bien","long binh","long truong","lotte lieu giai","luong son","mai chau","mai ha","manor","me tri","me tri ha","me tri thuong","meo vac","mizuki","mizuki mp3","mizuki park","my dinh","my dinh song da","nam cam ranh","nam dinh","nam hoa lu","nam ly","nam tu liem","nghia do","ngo gia tu","ngoc dai","ngoc ha","ngoc khanh","nguyen co thach","nguyen dong chi","nguyen hoang","nguyen hue","nguyen huu canh","nguyen huy tuong","nguyen kha trac","nguyen khang","nguyen khanh toan","nguyen luong bang","nguyen ngoc vu","nguyen trai","nguyen tuan","nguyen van cu","nguyen van ngoc","nguyen xien","nhieu loc","ninh binh","noi bai","o cho dua","o dien","pham huy thong","pham ngoc thach","pham tuan tai","pham van dong","phan dinh phung","phan ke binh","pho hien","pho nhon","phu dien","phu dinh","phu do","phu dong","phu lam","phu nhuan","phu thuong","phuc loi","phuc tho","phung cong","phuoc long","phuong liet","quang minh","rose town","sai gon","saigon centre","showroom dong tam","sky city","skypark","son dong","su pham","sunwah pearl","tam coc","tan cang","tan dinh","tan hung","tan my","tan tay do","tan tien","tasco mall long bien","tay ho","tay hoa lu","tay phuong","thach that","thai binh","thai hoa","thang long","thanh cong","thanh liet","thanh my tay","thanh thai","thanh tri","thanh xuan","thanh xuan bac","thao dien","the garden","the zei","thien loc","thu duc","thu lam","thuong cat","thuy khue","thuy linh","times city","to hieu","to ngoc van","ton that thuyet","tram troi","tran binh","tran dai nghia","tran duy hung","tran lam","tran quoc hoan","tran quoc vuong","tran thai tong","tran tu binh","tran van lai","trieu khuc","trinh van bo","tru so chinh","trung hoa","trung kinh","trung liet","trung yen","tu liem","tu son","tuong mai","valora mizuki","van con","van giang","van mieu quoc tu giam","van phuc","ven ho tay","vincom center landmark 81","vincom dong khoi","vincom imperia","vincom landmark 81","vincom nguyen chi thanh","vincom pham ngoc thach","vincom thao dien","vincom tran duy hung","vinh hung","vinh thanh","vinh tuy","vinhomes central park","vinhomes gardenia","vinhomes tan cang","vo thi sau","vu pham ham","vu phuc","vu tong phan","vu trong phung","vuon lai","xuan dinh","xuan hoa","xuan thuy","y yen","yen hoa","yen my","yen nghia","yen so"],"desc_words":["aeon","an","bach","ban","banh","be","ben","bia","bidv","bien","bo","branch","bun","ca","canh","cat","cay","cha","cham","chau","che","chin","cho","chung","chuyen","clinic","com","cs4","cua","cung","cuon","cuu","da","dac","dang","dao","dau","day","de","dental","dich","diem","do","dung","ech","ga","germany","giai","giat","group","hai","han","hanh","hoi","hop","ke","kem","khac","kham","kiem","kien","la","lac","lam","lau","lich","lieu","little","lop","ly","mai","mall","mam","massage","may","meo","mi","mien","nam","ngan","nghiep","ngon","nhat","nieu","non","nu","nuong","pha","phat","phe","phi","phong","quan","ran","rang","restaurant","salon","san","sinh","soc","su","sua","sun","tam","tang","tao","tap","tay","tham","than","thi","thit","thoai","thoi","thu","thue","thuy","tiem","tieu","tinh","tmcp","to","toc","tomyum","tram","trang","trien","trieu","tttm","tuoi","va","vang","vi","vietnamese","vincity","vn","vo","vu","xe"],"category_lr":{"hash":32768,"idf":"CIIBggGCBoIBfQR9GoIEggGCAoIEggKCA4ICggt9HXAHfQFpBoIGbQ9sBoIOgg16AoICdweCCYICeg1cA4ITdwtLA30CfQdkCHcDdwh9AYIHegh9DXcMghN0AoIGXg9ZAXoDfQNnBIIBcgKCCH0GggJ3BHcIcgiCDoIDVgWCAWkJZiWCC3ICggWCCXoBfRRwAoIKggZ9EIIHggaCAnoHfQp3A1MCggR0CIIEYQaCA3QHggJyA30Bgg+CAn0MbAN3AnoGggKCC4IBaCp9AoIPggx3BHoEfQKCDHQMdwJ3A4IVdxiCDYIJTAFsGHoHggiCB4ILggJ6BnIBSh9iAlgBfQR9CXcCfQOCAW0DfQGCAX0HfQR9Bn0CfRZ9FYIHggZyDoIGggRfA4IOegiCAn0CggiCClwIWwJwEnIDfQRsGH0BggJ9AX0Gegl9A30UYQF3AoIIegt3An0HehNyGoICWgN9AloEfQFkA30BYQV9CIICggJhCW0BggSCCoIGfQF6CnIIggGCAYIFggiCA4ISbwOCEn0EbwFvC3IEfQZ9DX0BbQ6CBWsNggKCBIIBgh2CAoIBggOCBHQOeg6CAYICfQJyBnoDcgSCC4IOVQJyAoIMfQV6AXoJfSGCG2wdfQWCA30DghqCAXoPcAaCBnoLYgSCAn0GdwOCDU8FfQaCA2sCggGCE2QGggh9B4ICggmCA28BggGCA3cFfQF9A4IIdwt0AWcBggOCG4IDZQOCA28FghR0B30BYw5yBW0KggKCAoIBZwmCBIIJggFsFIICggeCDncPggSCCX0FfQaCBn0Hgg99AXoFggSCE3oGZRByBIIIdASCBXoDfQR3F30KZwJ9FoIiUAFhB3oLggOCBXoEbDdpKnAFggKCCYILegx9CIIGbQSCBIIdfQd3A4IFggKCBYIHggt0Am0Jggh9CIINZAhvDmkBegWCAn0Fggh9D3IPegGCFYIDfQOCB3oCggNkAoIEfQKCA4IIcANvBn0Cggh9AX0LggF3CHcCYxZjCYICggh6A30NfQdlGIIJggOCDnQQfQJ3BYIRcgKCDX0DggaCB4IFdwmCCWwFfQl6C30LfQOCB28Qeg1vA4IBcgF6BYIBggKCAoIGdAd9A30PggR9AYIFggV9DXoEbAJ9BX0IggheAWcFggp9AX0FfRlUAn0BXQZ9Fm8FbQN9CH0JgguCBX0GdCl9B4IUegZ6CIICggF9B4IGcgZ3FX0CfQuCAYIHegmCCH0Cgg6CEHcCfQWCAYINdwGCC4ILggJkBoIIXhCCAn0PZwZ9AW8lggaCA1gBggaCAYIBfQJ9AYIEgg2CA3oESguCAYIeegZ9B30OZxZ0AYIEggl6A3oLgiqCB4ICggyCAXoQdAeCEXoBdARhCIISggiCBYIKfQRyIncOggKCAYICegV9CoIBggZ6C30BggGCCoIGfQJdAncXggKCAoIBegNrAlwNUwOCC30Ggg2CA3IMgg+CAV4IggNmBnoBZRKCCH0DaA13FXoCegZ6AXAhggqCB3cLggVvKYITggOCIYIIggd9AYIEbRdvA3oDfQ1rI4IWggGCAn0CfQiCEnoDYgGCCIIBfQRvC3oFegqCAnoCghZ9CFkRggSCEnARggaCAYIYegKCCnAGggRvGoIFggqCCnQCghuCAX0BfQF0CIICdBWCAW0OXwVaAYIEghGCBIIUgguCCoIefQtBC30TggZ9F4IOggyCA30fghWCA0wvdwWCBoIDggFvBncRZQNwBoIaghd9GXQRYw1tBoIIgiCCA1sDggGCA30gdC6CAXQVbwqCAmcLfQl6B30cggp9GYIGggF3EX0LfQGCClMCfQaCB3IQggx9AYIEchiCAVQDegKCBH0LfQuCCYIaYRB6AYICXxeCDIIRdAaCAncBghOCDXoBghiCA30NdwFwF3ABgiV6MIIDegd9A4IIggV9A20Eggx3CYIGegOCGX0YehN6CHIIggxaDnABggGCAXQGgguCBIILggZkBIIEcgqCCYITggF0BHoQgg96AoIMdw2CBX0FghaCDoIQggRyCIIGggOCBXoDZAKCB3oIggGCGXojegd0DIIiXw5rBm0KggyCAYIGfQFXAXoGegSCEXQDggF6AYIEggF6CIIIdwJ9An0Egg1tAoIEggOCDYIGfQR6AYIFggJtEF8BggZdE3oKggaCAn0GghBtFWwMfRWCCIIDggl9BoIOgheCCnoBfQmCB3oEfQNwAYIPggt6CH0MggWCA28BggV3DXAFggRvAYIIgg6CBz0BfQ19B4IFggV9CX0NggWCB2QNggGCDoINggOCB28qggR9BHoFggGCE3oNdwx9BIIBgiNsAnoKgiJyAnQHYQJ9A3oBdAdsD2gCfQJ6BYIQaAOCBIIFfRBVDoICggt9HIIHegSCDXoPgh90A4IOghOCBoICUwptA3oEfQJVCoIBegeCEXoXdwJ9CYIBdxCCGYIHfQeCBH0GdwR3B3QPggGCBH0GfQJwAYICggFJAoIBfQGCBoIEdxFwCXoCggiCDn0GggJ9BXoCggqCDnIOfQqCFoIDghN3A2wDfRqCC2EBfQF9DXoXfQGCEYIlbQJvFH0BegWCBX0McASCA3cCggOCC4IRggF0BIIGWgaCBXcVggR9CX0JggmCEXcFdwFvBnoKgiKCAYIIggh9CYImggiCCn0Cggt6AXACggJtBIIFfQV9FoICggF3C4IQegKCBoITfQaCAXcBgiFZBnoEggV9BIICegpkB30Keg2CAoIEbQGCBn0CfSJvAoINggKCBYIJdx19C3cJggZyAoIEggF9C1MbdwGCBYIBggiCA4IMggJ6AoIIVwGCB2cDbwFwCIIQegGCCnoJfQGCDHQSegV6GYISggiCBn0Vgg9oDYIHfQp9C4IGcgJNB4IBggWCAnoOggthDFYUfQKCCV8DggyCAmwWghqCE30DfQuCA30WggiCB30GfRpXAoICggJ9CYIFggV9An0Qggh0BYIDggaCCX0NegGCLWkKegVoC4IBggV9AXQEggN9CncBegJ9AoIIggZ9D4IKggOCAncGggaCBIIZdAx9BFYIegF0A30CcAaCJG8Bggd0EYIBfQF9Dk0HfReCB30FggFmF4IFggKCA30IfQqCA30GYAeCAncBegyCDXoEggR6BIIBggKCB3cEfQFJEG0GgheCBH0RggdyDHIBgheCFX0Fdw13A30HfQWCAVkDggt0DX0QggFyBIIHghmCCoIEdwR0B4ISgghtBn0BegGCBX0HegRhA30FegJZDXQLehiCA3cEghNkBXQMggaCA30NYQx9A4IHggOCDX0JbRGCA3cLggaCA4ICggSCAYIKehaCAncEegN0B4IBggJ9A30WfQeCDnoHggeCH4ICcgN9EYIEggdyA3QDdAuCCHcMggyCBH0Gggx9CoISggJ9BIIfZgJ3C10BfQt9BIIBdw19DXoJggN0EH0KggR9Dn0BdAF9DWUKaQKCC3oGggiCBYITghZnFoIEdAOCBlcFggeCCIIMggFOBIIKTAOCCXoBfQmCD4ICgghyA3cBggSCAoIDggZyDoIBfRuCBIIaeh59AX0dZwWCAnQLghiCDWwDggd9DlcUghtRBHIUggN9AV8CfQyCC3QEggR6AYIGggd3BHQEgh6CB3cgggh9C3cNfQ10CXcNeg6CBIIRfQaCA2gCggh9AYIFggiCA3oNghtmB3QEggaCBYIDegJ3AXoCghhtA4IHawN6CnoIgguCBmYUbwaCBXcFbQOCAYISThd9I4IGdwl9C1cMdwSCDoICggKCE30CfQZ9AXoCdw19AnAOfQd9CoIJbQyCEG8MXRN9BYIEggGCBnoWchaCBIIINQN6DGEHgg1yD30CggR6AXcEYwGCAYIDggR9CWcBfQ5sAX0Kehd3A4INggZ9C30LggWCCGwMgg99AoIDghqCAoIIggd3AoIEcAZrCIIGggJ9Bn0BggN6AX0Dgg6CB4IIfQKCEHcEdAOCCXoBegGCA4IZfQt6B3ICggp3A4IifQ+CAUwDggqCBIIHghZ3B30BcgmCBoICeg96AoIJfQGCBIIBghaCBIIFggR9CIIHdB6CAXABfReCAYIeQAmCAYIVfQF9B20CfQ6CBYIFdAWCJXQBfQGCBYIBggOCC3oCdxt9GYIYggdWBmYxfQKCB30Bggp9E4INYwJ3A30bcgSCAX0CdANLA2sEggdwAYIIggqCGoIHggGCAoIJggFyBoIIggFyCIIDghaCIHoHggWCBm0Pggx9CXQRggKCBH0PfQSCBYIBggOCBX0FghWCAnoOaQaCCYIFggh3B2EXfQF9BoIEggpaD2YPfQF6BoIFVCZ9A4IFfQF9DIIDfQ56A30QgiCCEoISfQGCEmECggR3A4ILggWCCIIFcAGCC4IMggp6DX0CfR6CBHcBfRaCBYIKcA56AncRfQqCMn0FggmCA4ICegR9A4IEfQOCA4IFghCCB4IReghhBn0cehl6AksOfQWCPnoBdyuCAnoCcgKCAX0EdAWCBX0DggdmA4IGdwGCBX0PfQOCF28BgiyCAYIJggWCC4IMcAGCCn0DbQuCAn0WggNnCIIJTAGCAYIBggJ9AnQEbSBeBIIHggl9B2QCfSaCAYIHUgmCBnoKTwV9AoIScA6CA3oHggV0B4IGZwF6AYIIbQJ9B4IFdwKCAVYbggaCAnQqfQpKBoIEcgJ9DYIBbRqCB4ISdwKCDIIFehFXAoIQURh3EHoGggOCHnQNggmCA4ICehRpBGIJdAJvAmYDfRWCBYIHdwSCDYIFbwN3D1oBWQeCBoIBegpEAncJdAR9CHcBggR9FX0EggR9Fl0DcgSCCn0EegdlBnAIegaCBIIIdw6CBn0CfQiCBIISghWCA4IKcgJ3BIIEggR0D2EDggx9AoIIYgJsAoIBggV6B4IGXgGCCGwifQF9BIILbAR9Fn0LehCCBHctehmCB3QBegGCAn0JfQJjDIIBgg5SDYIHggGCEYICegGCD3cGghh3BIIEghaCAoIEbRl0A1kHggp6AU0Dggh9A4IadAGCB30DawR9A2cGggRtB18CcgmCBIIEggJ3AXoEdwFLB2gDbQF0H4IHdAV6H3ABggWCDXICcAZvDWsCfQGCBnoEggZ9CHcEfQeCAoIDggKCBHoGggd3AoIGggV6A4IeggSCBX0QegNvCH09bwh9AnoCegN9C30MggxwAn0Dgg6CGHQEghpMEYIHWQR9Bn0KShNWAYICegd0B30PcgdyIYIBfR19AnQRghqCBIIBfRKCBX0EbQxlAWgSegh9BoIPggJ0D3cGfQp6BIIMdwJRAXoHWwWCCVQPfR93CIIKawV9CGwFggaCBHAJggRyAoIMghZ6J3QMggGCDHcBggV9B4IHggJrAlgOdwR0A30CggZkA4IDgguCBncMfQqCBH0CdAuCEX0JdAiCCoIMZwN9AYICbA99AncKggKCB4IEch6CAU4BggSCCIIJggWCAnoCbAmCCoILcguCBIICggJ9A30KggNNDoICXwR9CIIJggpyAYICfQJ9CVAPfQF3FYIMegyCBIICggFXAWQJfQF3BH0GggZlCXcPfRGCAoIEggV9AncSggKCA30BVQSCDoIBghiCBoIHawl9FYIGegOCA3oHggWCEIIJXAaCDG0QegF3BYIEggmCDYIDggOCCIIBfQWCAlwCegOCB4IDghFwBWwJdAWCCHcPZgFeBF0ScCKCDoIRgg6CBmkOfQdyA30PegKCBoIBggZjC4IFgg59CHoRfQR6BIIBggmCBFYFgg9oDIIEggJ9A4ICggl6AYIBghaCCXAJggOCAn0MdwqCDH0GfQSCAn0CggpdAYIDggF6CIIKggiCFIIBcAJ9C30BggJ9CWMFggV3BH0KcgKCCoIJdBeCAn0EggiCB4ICegFlAoIGggOCB3QHggd6BHoCggaCA3INcgRdBIIEggJ9B3cBggKCFIIDghtdHmIFcAOCDYICegR9AYIBbQt9BoIHdw5aAoIJegl0MIIOggVtAn0BYSSCAn0CSQ2CB4IBgglvBYIPggd9BWwIbQKCA4IDfRhjBn0BggF0AX0Iggd0Cn0CaQGCCX0CdwlGB4IDXQJ6E30CfQ6CAn0EYQeCB30BghSCEYIFggh9BIIDWw2CAmUGfQJ9BIIBdAGCAYIEghF9JoIPdwF9AVUBfRV6BYIEggNhB4IPfQpeH3oEegyCClUFegOCAn0fWQRyAl0FggZ9EIIFfSJ6DH0FghWCDncBfRGCBX0Bgg19Bn0TVAN9C4ICgguCA4INfQyCCYICggx9D4IIdAJ9BoIDegVZD4IPXwF6CoICfQ5tAmYPdwJ3C30BggaCCmUGbwJ6DoIDggiCB4IGbxd9B4IHggNvFoINggGCA30DggFKCnICfQeCCYISfQGCCIICggV9A4IJfQV9BYIFggeCA2wHggx9CYIQggN6An0jfQOCA3IEfQN6BXABegFtA4ICdwZ0DHQIcAaCBXQCcAWCHIICggV6HYIRfQOCCWwPegaCCl8BcgyCEHAbggZ6CnABcARyA2kIegGCF4IEggVJC4IIggqCBoIEggaCCYICggKCCoIDghJ3AYIGdwl6A3clfQZ6A4INggR9BYIOggiCBn0SYA9eAXcBdAyCDn0BdAN9AoIDeheCBX0CegWCBGEGggKCDnoUdwN6AV4DaQ1vA3cBegmCC4IEggplAX0FghdyBoINfQOCD4IFgg96DIIDghJ3BHolegSCCVILggltCoIBggV6BIILegGCBYICggOCAUkFggp3BYINfQaCDoIFcgh9BoIOghiCBm8IegeCAoIBfQF9B30Jgg99DoIBggVrCXQCegKCAWwKdwJ0BXQBegyCBX0JggZ9A3oOYAJ9DnQGfQNQA30EggGCEX0qZwlgBHoKbQGCAWMHdAF9AmQGggN6BYILggJ6AYIBVQxwBoICfQSCEoIBbAuCAXoKfQGCAoIFggdyO2IFegR9C30BfQGCDX0Ygg53A4IGggF6AYIefQaCDoIFfQKCG3QCfQV0BGYCfQOCAoICggaCBIIOXwGCCIIBegKCCX0CdwqCCH0BggF6Cl8EggOCBGkEfQGCBYIBegGCAYIEggGCAX0Eawp3AX0QggN9BYIKcAF9AXcFggd6EYIJdAN6EIIJUAGCBoICdwFpDIIIZA99BncCVAuCB30Edw2CCncEggd9DIIcegOCD4INfQ2CD3oDZweCAoIGgglZAoINbQF6BHoTggGCBG0BbQh9AnoIghSCBn0GghY2Gm8BfQJAA3oScgGCAoIBfRGCCIIFggtwA30CggmCBoIBeg6CAnoYgg+CAX0CggJyGX0EehB9AlQdggmCE4IMfQyCA30TggF9BHcBfQWCBmkDegJ6BoICggNlA30LcAKCBIIEeg+CEH0bXwSCAn0BggaCBGAEeh2CB4IHfQqCBlgEggGCCH0FZARoBn0BfQFtAl8RgghsAkwkgg59AYIGgghOJIIBggJyEYIEYwNrF3QBggJyBX0HegN6D4Iichh9BXQJegGCCIIDggWCHYIWcAWCBYIReiKCBGwMXwlvDIIDggF9B3QBdAeCIYIPggl3BX0BggR3GEsYgguCAn0JggSCE30DfQaCBYIHfQZyD4IEggF9A3QDggGCEIILfQN3GHoBggGCAoICghCCCGsFfQp9Dn0Iegx9CX0QggOCAYICfQFMAncRggKCA30SfQd9GoILVxJ9BIIQggx0A30FfQx6CIIMggSCCoIEShCCBoIBaAKCDH0RfQNvAoIKggx6DIIUfQOCDHcCgg96CHoGggN9CHoFdAGCCHcJegRkAoIBegKCCn0HggJ6CE8IfQR9AYIZggR9AoIBfRh9EFAFggh9AYIEggyCB4ILegZ9B3QKggqCCoIHgg+CCnoDfQJ3AncBdwqCAn0CcgGCB3oDgiCCAnogfQKCAXQNaRB6A2cdegxdAXoFZheCAXoBdAxsBHoJeg2CD3cDggeCCmcLVBqCBXcGfQVtBHQNdwpvCoIHegd9FYIFdwiCCHoMdwGCCIIDfRV6C3cCbAKCCmMDggSCCYIDgg5rC3oCdAeCA3oCggmCAYIDfRCCAYIPdwWCBIIGghJ9B2gLggN9CH0MegqCAXcKghqCA4IDTQOCAoIDdwdtAnADfQKCA4IMZAWCBIIHegV6B2YCdw16BIIBdByCBXILegGCCIIDWQ59An0NfQx9GXAGbAJSA4IWggeCEYIBgg99A3QZggFwB3cGdAV6DHQBfQ99CIINggOCBXojfR6CB4IGggGCGn0Beg59AoIFggZ9AYIFeiiCC30BWwSCB3cGSQN9CVwMWQOCAYICgiOCAX0Egh16BIIIggaCDYICdxKCBXQHdwmCBHoCghmCBYIGggxpAnQGggJ9FYIEgg2CAoIXbBVvKH0IggdSBIIDfQeCBn0CXgpkCWMCXgSCAXcCggiCAoIaggOCEYIIdA93CncVegltBoIDeg2CFHcCfQR9AYISgg9vAnoBcAiCAYIWdAF6BmsDehl6B30CeglrCm8Bggd9A3oCdwNyA30TegKCBoICfQOCAnQFegyCCnoPggKCFIIFggWCCYICdwRyA4IKdAGCBYIQggeCA30SggF9E20cbQ6CAWIOggp3DIIFcgSCAYIKegR6BIITgg59AnoeggF3BXoJggmCGn0FawKCB30Jawp9En0BaQWCA30DggJ6CoICghp6EHoWfQeCAm8CdBB9CH0Bghh6B4IJTwuCBoIDggaCAXABgglyAYIBdAd6BH0HggRrA4IJZAeCBnoIgg9XAn0PggZ3G3cYggJcAYIEfRNXAnoGXgh3A4IGfQN0CXoCfRCCB3cCfQF9CnoOegSCC2kMWwmCBoITggp6FnIGggZoAoILggSCBIIIWxCCA3cGggN9BHoRfQV6GXoIggl6AYIYggKCDYIEggd3FncBggh9CYIHggp3C2wTghSCBYIEawF0BIIDaQGCC3AQdAiCCn0FggZwB4IXggaCCX0KfQV9C30EggJ9AoIJbQZ3C3cIfQWCDIIGghV0KYIRdwSCAYIFggeCAn0GcAR9I3oGggZ0AoIGYAOCCIIBggmCEIIDggJvD30sdwtnCnoBcAl3CIIGggFPCHoBfQF9HG8HcAV6AXAReg19BoIGcAN9B4IXggWCCnQCggJtA4IHgheCCHoDegKCDn0CggV0A00IggyCA30EaRSCBIINbQmCCHcBggGCDYIDfQeCAWwEggJ9BF8RdwJdA3cFghVyCXIRcgN3CXoeggN9BXoDdAqCA3oagh2CBYIEehB3CV8CggaCCGILggGCC4IQaAJsJIIMTgF6FX0MfQFrAm0OggOCA30EggSCBIIIghFYAYIMgglyBH0HfQSCBoIKfQ1jA4IWggGCBH0Bggd9An0DfQFiEXoGeh6CClcJggdjAoIgfQSCB30MXQJ9A3cHghqCAYIDggx0BIIGggR6G4IBfQhwAYIFfQZ3AYIBgh+CC4IBggZoAmkZbAJiA4IHegV6BoINgghrA30MfQiCCGQIfRB0Dm0HegV9BHoRggSCAoIGfQGCB4IEegeCA30eggqCE4ICdAx3A30Dggd3BnoRfQl9A3AEfQSCGHoGfQN0AnIBchViFH0RcAKCCmgFegFeG4IIgg16CoILggSCBoIHggV9C3oCggNwAn0Cdw+CE4ILggdZCYIOfSGCBoIDggF6AoIBcBCCEIIFggJ9Cn0CfQN3A4IHcgtsA4IIggaCA18EehFaClwRfQRlA4ICfQFsCoICUwSCAnIHcAGCC4IBggx3CIIFghNeA4IMdASCAXAFfQeCBYIGZw56Fl8GYwFiEn0HghWCDoIBggqCFF8OegKCDn0GggOCB28JggptBYICaASCAn0FggN6AXASZQJtBYIBghaCAoIHYxJtAYIHfQJ9B4ITggOCB3cKggaCA4ISdAF3BGcTghZyDncFghN9AX0GggNND30Bghh0CHoDghR0BoIDggWCDn0LggJZA4IBdAOCBoICcgGCCHAUggqCA4IJfQF6BEkMghlwBIIYggGCCXcDggaCCn0IggJFC4IDfQSCAYIHdAhnBXoDggF9A1YBeg6CAXcEfQKCAWwBggF6En0JggGCBVYIggl6AYIWbwaCEH0CUANwDoISbQSCD4IEaQKCB3IIgg1hAmEEaw19CnIPfQl0D1gJggN3EH0Gcgd9AoIPSQ9lBYIXegh9Am0gcAJ9B3QqghFlBWQJggZaAYIBfQVrC30CbwZ9BYIHggOCAYIGWRSCAoIIggl6AXQCfQeCDncPdwKCAoIFfQNMB1gCZANtB4IPVgF0BIIBfQGCBYIaggV9A3cLggKCBIIOggGCBoIIegOCBncBghB9BXoCXAOCCIIMghN9FIIIfQR9BXQFggV3AYIBgg96BIIEfQVsAl0FehWCBmQOdwGCBoIITQiCA4ICggF6D4IEggaCCGUEggZ9AnQBggh6CYIEggSCCHIDXARmCn0CXgR9EVwIggtyDDIFdxqCBX0Mggl0A3oHegd6B20EggeCCFwGfRVdBVIDggKCAW8DggJ0AnoEbAFeBIICgglsB2YBggJrC30EdwR3A4ICegOCAXQFaAJ9AYIBdwWCAYIEYQJ9BWYUbQN0BH0BaQeCB4IGfQaCAYIDdAJnA2sTggpVBTQCggdCBUoBbQJtD30HXwKCAoICbAN0AlwIRwtyAmQSbwRpAoICeglrBYIBTwGCA2gDVgd9AlwDegN9BHcGWgVkBm0DMwuCDIIGegFnD4IBUwN0C20HaAxoB1ICghOCAncCfQp9AXQGdAFwA3IBaQF9Bn0ISBFJBFsBdw+CDIIGfQVyBXADggFoCYILVAyCBTMBdwtwAYIBfQN0Am0BNgNyA2YBcAlnA2MCcgJhA30DZQiCA3ACghJNBIIEdANwC4IVggF9BXIFYAxwBYIIYglwBnIacg9sAnIIdAFXAmsKfQGCBGkCfQ2CDHoBegJvA2gCggGCFWwCfRFkE2QOcgxsAlgCehGCA3oHVAV9FF4IggmCBoIDegJ3A4IOdwNVAV4CghR9FoIFfQNpBn0EcgFnBlQJUgF3E3cETANyA2UCdw5yBFYMcAVtAoILggJ3CIIHggN6B4IBfQZ9A4IBegKCAoIBTgJnCYIGYAFhAX0LggqCDFwBggN9AmEBbwVyBX0DfQN9A1MCegV9DnoBggF9AoIjfQ+CCncJggNeAWkJYgJ9BmwIbQh9B3oDggOCA3oBggGCBX0HbwF9AYIMdAOCAVgJTxeCD4IEegl3DIIJbQOCAYIeXwRiA4ICTANlBIIJdAmCB4ICfQNwAlsDegeCCoICUQiCBXoBcgGCAncBYQFQB4INdAGCBnAHggKCBWcJfQmCAnIHegdwA4IFfQFeAYIKfRJ3CHoBdAV9B3oDYQF9A30CbQdJCIIEggJ6CYIHcgJtBn0BfQqCAVwFggF0D2QEfRKCA0ICggRRFXIDggJyCUsLfQx6D3oBbwRMCH0BbxF0BG0CaxZ0DYIEehF3BncBfQJ6DnoBcAN9CFgGaAqCBYIEdwF9AmEMcAo/DmQDdAV9BG8BggN3AX0MYQKCBEoGVAF9BmwLcgiCAXAGggaCAmQFQBR3AXoKZwNvAn0JbQVTBmsBgg90BX0FXgaCAncKfQFvBFsCWwp0CV0DggSCAl4QfQSCAXIDZAJwCHIDgglvEHACdAF6AWgCfQhlBnoNggddBXoBVwh9BH0Begx0CIIBWwMxBmQQggV0B4IDWwN6CYIJOwGCBnoBggR9Al4DaQRAAWYCggJpBHcOggh6DlwDdwJyElcCRAhsAlEBSQOCBHcGZAF3GmMDfQJtAmMBbQGCB2gNggU7A28EfQZnAnAcdwFjAVcDXgJ6AYICggOCA4IEfQ5yDXoHegNrAYIFcgZoAXQCgg+CBlwLdBR9Am0CVgRfD30BggJ9AX0JggN3AWgBWgh9AoIFggaCBWMGdAaCAoIBcgRwAmECghNhBoIJegGCA3QQdAeCAXoBdAlJDYIBghV3CXoFfQZPDYIKcAF9DWUNXwJ9A3IGfRKCA3oFggQ6BX0DbwZKBH0HggViBXoLggN9D30VggN0AYIFcAV6DXoRggF9BmcFWQ2CAXcCfQZ9B4INggZ3AnACegeCAXoFggJwAmgFXwJWAnIXcgaCAXQBTgSCCH0BdAJtCn0DfRF0BHoCggp6GXQEdwOCA4IJegNlCnoBVgpyD3QDfQF6DYIDggJ9AzcVdAJBCnIFWQRtBmwEfQVRBYIabAVYBncJUwd9An0DggF6AncCcAJ9A4IBSQeCAUcHXQN6CIIKWQF9CYIBggdDDIIDggRJAXIDcASCAnoBYRRtDYITcgF9CH0KegSCE4IMdwN9CHcVbAWCAnoDZQJ9A3oFfQN9AoILbwlfAYIBggVhA3cCfQRyA4IOggJyBGwEggZ9AoIHSQSCAXoKVwOCDWYDXQyCCH0Eggh6AX0JXQyCDHAOcA5hAXcCawFlBV8Cegd3B3cIggZ3BoIEdxCCA30EdwWCA4IHgghgCnoEggt0CX0FaQZ3A2cBdweCA04EOgF6AmgMSgWCCXcGdwt9AoILfQJ9BFECaAWCDIICggFOB4ICchR9BYIGggJwBoIFQQV0An0IdwKCH1sBfQVZCncGSwGCBnQFcAGCCHQEggyCAYIBggNmAoILggN9ElkBeg96AmgDdwFyAXcBaQaCA1EJggtnAVYBWypwAzcCggFwB30BegZdCoIJegJ9CX0JbwWCD4IBegyCA2QNWw5gCn0IggFyBXcGZAVaDX0BggqCC4IBgg90BnQCZAhoA3ICfQF9CoIFdwGCA0wCggJ6BHcJggN6A4INggSCBYIMYwJ6GUQGgghdCoIKcAJ9BX0GdAiCCYILggFfBX0JdwOCA30DggZBA2EOegSCA18WggF6AnoBawpyAXcCggJyAoIFgghhAYIBbwx6AXoHegFwAX0EfQVIBGgEVgVvCn0NfQKCA3oDfQ6CAoILRgaCC4ICcgdtCIIJYQZ9AW0HZANvBFUFNhReB30RYBBpAUcLggdgHXoBcgFsBoIBggRoAnoCbxSCBYIGfQGCAoIEfQF9CnoEdwU9AmsJYAZhAX0DcAKCAVICfQJMAnoFaw2CAYIUghN6BX0DaBxsDX0BeglwGE4GegyCB4IFcAd6AlEKegFyBmEMggJ0FV8DggaCAXcKaQFoDH0JfQJ6Bn0CQgF3BkIQfQOCA4IDcAF6CIIBdwmCCIICdAJsB1cEfQaCB3oCdBVgBnQDXgJ9AXcFggFSEnQBggU+A1AJggSCB3oBfQF9AmwGVQGCAm8iXgR9AX0CggJvDX0DegRyAX0JggJvA3AGbwI/AmQIdxZSF3cCVwE5AYIBggtnCWQEdxCCBHcIggWCDH0Ncgx0B14KggJ0DIIFfQWCAncCdwN3EEELegx3Ak0FggR0BncDfRqCAX0CggNnA3cGggSCB4IBfQWCBoICfQlwBnQGggFsBm0DcBR3BIIIegV9CGICdAWCB30BbQ59BzsDcA6CDk0HWwVvHHoCegmCAYIXbAJ0AmkEfQZZBYIDggGCBVoDdAR3BG0RggF9A1UEegJ3DF4DfQZ3BIICcAyCCzQQbAF3AX0BfQd6C4ILXgM8EncFggZpA00JfQVSAYIIbARwCW8aaASCA3QEggN9CYIDcgN6GIIFggJKA20fXSiCAUYFbAJ9A4IGegh9A3QEggGCA20SggJ6Bm0DggdbA0sLdAOCBnoBUglmBn0DciBvBHABfQWCAUYCaQhvAVwEggWCAoIIggGCCYINfQV3BX0VdAJ9A4ISbyKCAWkHfQhvCXoRcgaCAYIEdwyCEHcJXAhsBYIGcgKCAnQOfQNwAlIKeiVwDncHcgNyA4IIdw43En0Bgg+CBX0IbApvC4ICbRhtBYIMbxSCB4IFcgN0DW8DLAldC30KZB6CCIIKQA1CA4IHYQNbA0wJdwaCB4IHggNkAXICggJkFXICcgR3AT4CdwFgA2kFXApjCUICfQRnB4IEaAJ9CGUCgg1kBIIbVAV6AnoGggN3B4IBggKCFmgIegSCBYIMggcwGlwCWQJkB30QaAV3AnoEggNpD30PYgRiCHcIdBmCC3QKbAV6AoIDggd9BH0BggFpCkAFbANyCF0FcgJ9AWMFggJeAzQHfQl6BIIEdwNkAnAEbCZtAlkEdwFyCkoBdAGCCmUDegd0BHcBZQF6EIIEgguCAlsHdwFrAoIBfQJ3BGkHVgZrB28XgglvAYIFggN3AnoEegaCAWsCfQp3AWYCawZ3CmkDggNeAoIIawVwAYIBggFoA2UBggd3AlEGdwF3AmMJggpKC28CfQZPAVsBZgRwBm0HXgOCAoIDfQJUB2wSTAF9C4ICdAR9BmYHggh0Cz4BcglyAYIBQgWCA4IJegN9C4IFdA99B30CfQl6A2YCggSCA30IggVwBFcBehV6BYIGggKCCYICggaCBG8IfQ59GHQPaxV0AXIGYwJ9A2UMfQF6F4IKcAKCBH0GdwRmA28TcAh9AXoBdwWCBoIPXA2CBUYBbAN6BGQJegiCDH0aOwN0D4ICegGCDnAEdweCB4IEUgRtBloUcgJEAXcIXgR9Am8EXAh3A3QBggN6Cn0fdwJwAoILXBB6BkgDggRtAmQMWQR6BYILggFRA3oEZgZyA30BaAN6A4IDegdeBncEdwdZA2ISggKCBWwIfQ6CE30BZwKCAYIGdARoAmUEbwmCAWgIfQRYAn0IggR9FFwIPAF6CIIBdAZkAnAaZwVZCn0EcAp3JIIKbwuCAX0HdA9tCmUJgg1cA30HdAiCBlYFbAlpB3oEbwd9AXQGfQRvAWEJZw1yBHABbQNICXcbdwGCBnQRghBvCoILggOCBX0HbwaCAoIIdwF9FoICdAh0A3cBggNwB3ICdxNeDoIGegRXA30WfQhwDIIGbAdkAn0EawOCAXcMdxGCBXoKUQV9AYIDQgR0CHQBaAFZDF8RdAKCAX0QcAFoAXIEggh3C3cBXwR3CnICdwpCAWgLfQRgB3QHdwmCAWsIgghrAXcDSRFbB3cCfRp9AmcEZRt9FX0CcAV6A08CggFtCYIEYwOCDmgadwSCBIIGegR3BX0HdwN9B4IOeg93BGYDggKCA4IFWwVrBF8VZANCBYIHfQGCAl4TbwN9BUkJfRd3Dl4BggF3AnQDdwZwBVMDdAR3AYIIggthBn0JWQN3BXcCggF6AXoBUgJ6BWwGggR6AWYMegJ9DWABbwJyDYILawR9F30EYQOCBIICfQ+CBHoFdw99AW8PggFKBXcEQgGCHj0KfQGCDIIKggI9AWYBcgt6CHcDegJ6AmsFggSCBIIBaQh0A4IDbQaCB3QCfQGCDH0Hggh0BoIBggRoBnoFVxWCCmgKdwlTB4IHLwKCFH0MggF6K4IEdxF9D4IBZQWCCXoLggV9EHQKcAOCCX0BggJ6C3oJbwiCAX0EbwyCBXcMdwFtDX0Gggl3A2cBWwGCBWQJfQZXAl4BfQGCAWYEfQVEA4IJghZICYIRggR0CnIOgiiCBHcCcgNyB4IRdwKCDWQHfQpmBEQFRgp9A4ICZAFyAX0Eeg99AncHSAF6BnoBggaCBIIGdAhBA30WfQN0CWgDggR9CXoKdAF6BIICggRXAncCfQGCBn0MawVlBHoDdwaCAnoIdAd3CmAIdwtjBXQBegZvAWsIbQaCAlAEggSCB3oGZgdtBHQSfQN9EIIIghFyB4ISgghtBYIDegV3B2QNggRmAncfegJ3BYIKfRBkBXoDfQt6AXQDTgJVAYITcg9nAYIHaQWCCH0Eawx3A0EHNwN9EoIGggeCC4IFggl6BXcGbwSCA3ICdw96GGUBbQV6AX0NggKCF1YTZwVyCIIDZxFfAmYFfQh9CH0FTQJwBUAKbwJ9CF8Bcgd0AWIOfQGCA3QEWgReEYIEfQ59A30MfQJ0A3AEggJrAYIFggR3D20Jcgt9BU0BWgJ9A3IBggdrB4IDfQGCBGsCZAF9EYICXwqCCHoBaQRaJ4IEfQt6GEMEggd9B4IEggVvAX0HXAJwBIIJcAJiBkoCfQFsAnoKbQmCBH0DawqCBXQbbQiCAm0BggR9BXQcfQR9CF0IZARdBoIBggJ3DG8EcgpdBn0VdwdhAmsWggZ6Cm8LggGCAXANdA56EnQNbBZSAoIJggOCAmgKZQRcAoIEWANUAn0BZQZvCIICcgNyAXIGbwNQAmMTggV9AXQGZAJyBnoBbw13DGkLggN9B3QKZQl6A30BggNlAYICggKCA2QEfQNeEnoGdwWCC20HbwKCAVkEcgSCBXcIaxeCAXIDZAd0EnQEYhaCBIICcgFcAXoIggZTBVoKgg96AlgBfQR6AYIMTAKCA20DdAkxBGcDggZYAXQCegyCCXoCegFyBoIGdAJ6B4IDggWCD2EFbAJwA4IDXwKCBoIEaQRJBXIEfQpoAmsLghByBG0UfQSCF30OcgJMBIIBZwJnB3cJegZpBl8CcAZ9BHoEegJvAXoGYwNcEXcLWgJ3CoIPbQVyDGQSggNGA2QRggNlDIIgaAlpBX0CdARiCF0BXQFtAkUQggGCBX0DcgOCAX0KggpNC0kCaAJhAmsDbQSCA3oFZgtwA4ICSxOCA3cCLgKCA3IGVQ53AncBdwF9E10PdwFpBYIDdwNsAoIEfQlVD3IKggJ0Dn0DeglsEHoBfQF9AnQDdwZ0A4IBcANNDnILggFhCIIEXwiCAWgIgiNhAX0BdAh6B4IPbAmCA1cCdwJ6BXAVegRtAYIQdwaCAk8cggF6AlcIThWCI4IFegOCDmMBggFyFIIHSAV6Cn0KegJ0A2gDggF3BYIKdwF6BHQCPAd6C28EggaCBH0KdwR9AoIGVQJKAVUHXg1UA1YBVAKCCoIBVgxvAmYPWQVsBH0CfQJ3A4IHfQF3BX0DbwFyC4IMWwdwAX0BggRjAWsDfQOCCVMKggFrAXAEZgKCA4IBggSCAmcDggR9A30HfQR9AlcCegKCAUYKghWCE2YHegJrClsMggR6AoIBaQlrAXoDZxV6B3cFfQl9BH0EgiZ9BHQKegVMBX0DggN3A4IEggR9A30FdAlbA4IDWBKCBHoCXQWCAVMFggaCCWsPfQFeDHQEcANrEmEEggRhBXICQgJ0AXQLgg1GCH0SaAaCBVoOchdVEV8Cgg1lA4IJawNrBnIRdw2CGXoMVQaCCGgIfQZ9AVABaxuCAV8BZQZfC3cEcgVwDoILggZ0CoIRfQRiCWUCggOCC2IOcAFrEm0CdwRkAncEggeCBnoKcgR0CIIDUQR3AmEHfQNvAYIOfQxyBH0Kgg1jBXcLcA93AoIHbApkA3QEggOCBX0BchdsAX0HfQuCAX0CXwJ9CVoDXBB6AoILgglyBn0Ydwx9AnoIbwaCBH0CUwdVEX0Geg1vBIIFfQRVAoIKggaCD2kCTQZwC1QCdAmCEHcLRhFoC3oHggJ6CWYGghJkAoILRQOCA1QHbwqCAXoFfQp6BoIBggF9BHQDXwV6BFAUggN9B4IIcgKCAnoGggtcEGECTBNyA3oDbwOCAoILcAhvAoIBfQJsAXACaAFtCXoEYwd6BH0DggKCAXQCbAKCBIIDXgOCBoIwQQN9CXoCXQp0BHcBKQKCAnAEZgNeCnICfQKCBIIIggJ0BHAGdwN9BWQHggFnAlIEggdeBFIJXwFeAWQWdAJvA2QBggx9CUIDbQ19BFYCdApsDlwJZQGCE4IGggGCEn0BbRCCB1IVdwFwCncCggpEBGQJfQRwA4IDbQt3B2UDWQSCAn0FfQGCEXcPggdcA3IHbQ9wA4ICXgd9A2wGfQGCAoIBeg1RD28FQwZtBIICggN9EXcDdBV6DXcBfQZtCGIBfQJwAnQHRQNdA0YEehGCBYIKegJrA28CggeCAWcXcAZ9CGsCZwFSD0YGggOCCXQBbAKCCGgDggKCDnIKZwKCBVgCRQF9ATwIfQF6AoIDcgdlB30FfRV3AXISdw1JBH0FVgtkBFkDfQNWA2ECbAtUAysGcgGCBoIIegJ6CH0KggF6AX0BbwRVE1gLggZ9BFQIYgJ6B3oIdwh3A3IFggVmAnIDdAR9CoIBfQZaB1cCPwN3AYIGHwNsBoIDdAGCDW8LWQJpAn0FfQtwCV0LghV9AUoCggtyAWwIfQtvBG0GYQd9D30FegKCBoIEcAppBE8GZAWCBF8ESgFVA3IDYASCAk4JggOCDFsKfQV9BHoEZQN3BnoJXwNdFXICggR9B3oGfRJsA3oEggVGAn0Fegp0BHADTAJQA3oPRQSCBX0BNAGCCYILggJpB18CggZbA2gBegmCBnQFggx9CIIDfQJ9BH0IggZfB3cCegJkBlIFggtHBYIDVAKCBXABdwF0BXoDbQdDB3cIYQSCBYIFLAZkAWIBggR0AoIBfQOCBWISegptAnQEegWCA3QDdAqCB4IDbQ5tA3AIdAiCDHICfQZ6Bm8FcAlcBnAMggdnAX0DegFOEVYGUgl3AnABcAFRAkUEVgRrBW8CggFZCHcGghJ3CWwBVw19DUgCegWCAYICggGCBoIHaAGCBUwQZwZ9BIIHTAdnCHQFRgdLAXAFegFtBWAUegR9BH0CggVnBEkFggmCA3oIggVwBFALegdnCIICfQJ6BIICggd3CX0BawhyBGkHggF0A2EDbwphAX0NggR6BXIPggKCAYIGbwN6A2ECbwJNAm8BggF3AXcGbQGCAX0Bgg99BWQIZwF9C2YCdwF3BIIEQgt3Bm8DawJ6AWQBcAlwCH0CggZ9A1sMggR6AYIEegeCBIIDdAh6BWwHcgZvAWgBdARvAmwFggSCB3QFaQJ9A2QFggiCCXQCbBN9BWUEggJsCX0DcAY8AYIBdwVyAncLYwVJAV0DawN3AYIJbQR6A30CfQR3AoIJegt9AYICYAN3CHoBbQF6AnoEVw53AWkDggR3AWsHaQFfB2kEYwMvEoIBfQJ6F4IQYAOCBHoHggOCBH0Jawd0DH0GdwZdAnIEaAJLBn0FggY7AX0HZAVQHXoJYwSCCGQBcg5rCGADXg99AXcJdAGCB28RdAdsB2gBdwdoAXIGcAJeBXICdA53AXoCMAGCCHQCcAN6A3cGfQ1sBIIBdCOCCXQMXRF6BYIBbwOCAYIMggF9BWEBggGCCFsDggJjCWUKfQNrB28EVwuCB2YCXANrA3cGbQN6CHoOaw+CA30CbwVrCmkDcApSA3IBggFXBYIBXwdyAnABfQiCAWwBOxF9BXAHUARwAXcFbQFfB1EEeg1mC4IBdweCBGEIawFbAoIHPAR0AX0GXwFOAVsDbQaCAW0GegFwAoIGggR0EIIBbQV3D3QBUwyCA3oCaAJ9A18BegSCAncGghV0Bn0FXANFB4IEegV9AoIGggd6BH0EXAF3An0CXg59BnQTfQmCAnoBfQKCD4IDcgJ6C3QRbQNsD1cHbwxhBIIGawJfAXcEegRvA3ICWgJYC1kFggN9BV4CegJ6BYIFYwtZA14FZgp0CIIJegF3Bn0BdwR9AXcDaQd6AoISfQx3AW8KfQN6BIIBbBVwBF4BbQp3AWMIggl9BnoBdANyAn0BYgdmAX0HggOCBWEJcgNhAmgFTQJtAoIDfQKCBm8FdwN6A1QEbA1sC3QJdAJ9FH0HggVyC28BdwKCB2MDXQRsB1cDggGCC2sBggmCBGwEdARnA30HcARvAYIDfQGCA28FdwOCA4IKXwZTDlgNegF3AX0SggJRDnoMghFpBnQBYQNyA4IDegNvBT0LXAZ3AoIBQQJWBG0IUgF6BG8DdwV6D3cBggZODlgGcAWCCIIBegGCBnoCdwhiAXcCfQRUA3cCRAaCD20CZAmCAYIJeg13AX0TggR9CFkEeghfBnoEggF9AUUFggF9CXACMw1NBYICcAqCBoIBfQNoCncLegWCAYIEgglQBHQBbQZmAm0Ddwd3EIIDfRKCClsBYw5RBF0CdAZNBjsEdwKCAoIBXAFdB4IFKgVEBkAFfQF9AWMBfQJaBncOfQF9HH0EegJwCXQQggpoBmQLaw9NA1EJWgF3AVMBbwNsDEYGegF6BkICaQJrAoIEfQIsCFEDegGCA28IYRNtBWgFdwFpAXAMcAGCDX0DdwR9CIINcgxtCXcBSBBpA3oKfQJpBGkDfQE7AU8HZQVQBHACcgJdAoIKggSCBX0DUgZ3EoIQggl3A30LggSCBmYDawqCFFsCfQlgCHcCfQVZBVoPfQJwAn0BegF9A30DaQd3BncDdAFeA2EFcgR9AYIcSQd9AYIEYxVpAYINdwOCAX0BWgaCBIIIdwV3B3oHehGCB1cCghUqAVABgg59CH0MfQZOAWAKfQV3E4IDfQRwAoIDggF0CmgBdwVvCH0HbwSCFUsFQAiCA1cBegFmBFgCggJYAYIGdAxJAX0BbAOCAW8BggFPCnoHaAZyA4IFggRjBHoDdAFnAVYDggVwA3AiYwKCAYINggp3A4ILbAR9A2sHcAOCBGICbwJWAmsBfQd9AYICTwGCBWYCYQNmA3IFggJ9AXoCTgdEBjoCggtwA2gHdwF9CW0IZARyDV0IghKCAm0IfQNnBlsBdAJ9AoINZhF6DWEDggGCAYIISwRlAoIEggl6BWEEegJwCn0CggRsBj4GQgFwAXoHggJ6AUMEfQRFAVQCggJwAnQFdwGCBm8EfQNOB0YJcgV9Cn0Bcg59HW0HaweCD1kCYwZsEV4BdwKCAl4IWAFfAYIDMxd9AXQGfQRmAYIKSQF6CEcHehNbA3ACbQ90BIIEggGCEXoLegJ6A4ICbAV0AWwCggl3EYIJfQF3CIIGbwJdAWAFTgFnAlIBggV9A28EggF9A08CggF3AmgFggReBIIEdwd9BX0CaAWCA2sDfQmCAmsQfQN6A30GfQF9A4ILgg9mAmsCggpJCFcFghJ6AXoKaQJbA3IBfQh6C3cFdwVdAXIEXgeCBn0IRQJtA3cCegGCBYIIcgJZBX0CggJ9AoIDbwNPCIIKaxVyAWQMggROAkUJbwGCA18GcgFtAn0FegloCV0BaAZMAXQEZwZwAmQBPwRhEIIGggJtDkkBfQNkBlkFdARvA3IRYAl9C20CbQSCD3oNdwN6Bj8IggWCBG0Cbwo+BH0BggI2BWsGggR3Al4BghdXBn0GggtCAnoFSQJ9B4ICfQt9B3oBgg5vBHQIfQR9AX0BggdsCIIHaAt0AYIKXQE8AWECbwhyAn0BQgSCBn0BYQZpAV8DWwOCBXQHfQGCA0EFfQZ6AWkKfQdtD3ILPQFsBXQCXwJfBFMDdAJ6BWsDdwR0B3AKbQF0BGcBYAGCA2YIcgOCC3ACdwRnCzcRggJ3A4IHfQ2CBW0CbwKCCGsBfQZ3BIICTwN6DIIFdwtrBGUBggZ0DIICSAF6AoIEUQeCBX0KbQKCCoIFggJ9BWwBfQFfAmEDfQh9AmsHggaCB3IDWwF9BnQHegWCAV4KghKCAoIFchB9AnQEfQGCB2QBfQZ0DHoCdAZ9CnAFggGCBmEIbwV3DEIKbQZ3An0Jbw19B2EHggtwFVQHfQV6AXoJfQOCAkkLbQ9yAm8DfQ+CBksLggF9A3oCbwJkA30Bggl9BnoBdwJ9AnQLbwFpA3cBggJ6AnoNYAFpBGkFPQRsCHoFdANwAXQDdAGCBV0LdA10Cm8MfQlkDIIBYgR6DHoBZQU3AYIGRAJ0CHQBVwV6B4IIYQR9DnQETQGCAX0GYQF9AWQBWA90B3oBdAZmAlQFggWCAoICbwF0CmwFXwyCAU0BbAl0DoIENQd0AW8LdwttEXICZAyCBoIKegGCBoIBdAJkBVQCggZcB4IEYgN3B04CcAFlAnAFggJyAj4CWgGCC30EWAxtATwGfQllC3INcgSCBHQCUAR6Bn0CggptAYIBdweCDoIBchN6CH0CXQFrCHQDehZ9AXoHfQKCF3oRggx6DWwBegNmEYIHfQV0BXADggJ9CG0BbQF3BHAGMgF9AXoEggJ6C2sBXgVhA30GZQR9AncCcgN3AX0DdAJHDWQKcAJJAoIDfQt3A3ABggF3A3AFbwFyCX0GfQF9An0FggZmAW8KdANhBoIBggRmAXoBbwR3AYILbAKCBX0CRgF9C4IBbwFZCIIEfQJnAn0CfQl0A3cBfQd6AXoFbwJ6CXcCXwaCBIIGcgGCCkADfQFwCHoEbAKCAkEIcAKCDkoDggF9CIIDaQJ3C30HggN9CIIITgKCBlgJggJwA4ICVwFmA3ALegl9AnoFSAN3AoILfQF0CHQBawF0BXIHQQFeEIIQbA59BnAHaQxkCnAHSQF0Am0IggZTBXICSgN9C1wIggSCEG8EfRB6AXoBegJfCIIHdxVpAXAIQQd9CWYDYgqCA4IDZgNwBGwBaAuCC3oCdwJwC1EFXQJpBnACOAVBAWsDggVsA1wBWwtvAU0DfQhtB10CQQOCAmMGfQRkAYIFcAh6Aj0EXgJjC2cEehdyAn0CRA53AnIHggR6AXABbwWCBIIDfQZdAoIFggRQAXoLUwKCB3cFggaCGE8GZAKCBn0BZAV6BFcMdwKCA4IBegMqAUMDTiJwC30CWgR3CYIJfSB9AmELfQSCBXoCcAGCAUwGgg5jAkkGgghvAYICcgZNBGwFcgF0A4IBUAVTBmkNXwOCAV8BfQOCBW0HcgNHBXACfQZyBoIDfQGCBGkEdwR3B2IGcAh6AXcBfQRkA2EBVAdkAXoCaBeCAn0RawNrBW8BfQiCCmwQWAWCCoIFdwOCAnoXggOCA30BUAVkAW8DdAN6Bn0JcAJ3AoIEghFvAoIBfQJ9AoIBfQV0A3oMYwZoCUgHggdjA3cDegV9AXoRaAhRA3oEggWCA4IJcgV0BHcLggKCAncGegJcCHoBggGCAoIVWgJwD3oDYgRfEHcDegJ6Bn0DegKCC30DegFaCX0DegR9AWgIggJ3CnACdAKCAUwPXgWCBGUGegRZCnoGggR6CX0CVAJeEXcNUAqCBVUCQQdbBoIEggR9AW8DcAFZAn0FdwR6BYICggtjAXoFfQpgCloBggJ3BlAHdxRoBk0CggWCA4IIcgZhEHcJSwhpAoIIQQGCC14IghGCAn0FggN6AmEBggGCBGwCbQhtAloHggKCAlMNfQeCBn0GRgF0GIIBbxF6DX0OdxGCAXoIbwNtAoICXQGCBIIEggNdAoIFggJtB3cFggppAW8MegNkBHoESAx9EYIXggh9BGkfdwFnAUgCggZyBoIGdwhlBE0OggKCAoILWAp0BYIFggxlAnIDVQhrAmwCWwR3AX0OTgFaD20DaAVSBlMOghF0AoIEQw2CBHcaVARyDUgBbAJQAXcBegRFBncCghSCAkEHdARSAYIGggtCBXcCawRUAXcKXAuCBUgGbQyCB4IDghRfBn0FbQ2CBW8CcAx0BX0BawV0B1wCUQN9CH0EcAp6CHIBbwR6DH0GYA89D20ZggZ6C4IHghmCBIIDRgJYB4IFdAFvB2cEVQJbCjwDaBpmAnQEawFnBF0DaAN9CoIVawFlEXoCggFcCHADMwOCA30UWgd6BIICegJ6BYIFWgiCAWEFcAR6EYIHggmCDIIDggFkCG0CZgF6BHQBghFZCXQBggdpA30IVQlAAX0HggFsA3oEggVtAoICggh9B3IBbwSCB4IHggKCBYICaQJdE3oBbAN0A2YLfQJmCGcGggp9AlMDdAFgA28GYQFcAYIMXAV6CXQHegNnBYITggF3BVsEXw16DYISZghiDH0RdwNmA3ADegWCAl8NdAaCAYIBXgRwAVYBXQSCB4INcgSCE4IeggN6AnoCeg2CAmsJbQJABnoJegRWDH0BggVkAX0BRwJ9AoIVXAiCAWICcAN6Bk0CbQV3B3QGggOCC3cBaAJnBYIGegN9BYIGdwFQBW0CegaCAVwKggx9DEgDdwaCBYICfQNtB30EXgtfDH0CfQKCA3oCggSCAmwDVQWCA3QIWgR6BXQBcAFtBH0HggJtA3oETgGCCU4BdwF6AV0GggV9CmIBggp6BnICcgKCBWUGYgN3DHQgggFcA30BfQSCB2wBegKCCXoEdwOCBoIFegF6BXQIfQN6B30FggF0CIIDggFRBWEIggF6AnQHbBd6AoIBaRB9BlgEggRiBX0DbANLAkMBdwZ9AW8EggWCAnQPegWCBncFegeCGG8DggWCAUkLfQJEAWYSZgt9Bn0IghF9AmgEcgKCFn0HYwlYBW8EYRp9An0EggN9BHAGdAKCDncBdwOCAX0BbQF3CG0MfQeCAYIBegJKAnQFghOCAoICSAJJB4IDegJ9AlkGggpsAlkSfQJ9AT8CdAKCBIIBghB6AV4BdAh9BnAEggR6AnIHggVgAX0HegpoAYICdAFBBXAWcAReBXcDggWCBCwBfQVyBoIBggp3BWIDegR9AnIEggl3CG8GZgiCCncIWQdfBYIBbQdcA3AIcAF9A3oMggd3AXoCbASCAU4FgglvAnoKUg1FA3AIbwhDB0oCSwdWAoIDehp9AXoEcAN0BGQJggJyCF0CUwaCHYIDdwR3AVYIcAx3B30OfQRyCnoDRgh9FHcGYxB9AXoEggtwB4ITfQVvAX0EfQWCEWQJawRoAoIJfQqCAWsEYQFlCHQBZAFoC1oMdxR0AnoCWApyBVUEbAN3AlgDbQ1oA0MFbQZ6B30HbQN9CikBbwGCC3oIdwGCAXQEbwNOAYIBggd9AYIFfQ5sAYIEggR0AUwBggSCCncGXgpmB4ICZgVwCW8EfQJ0BnQDbw6CDHcPcgt9B2MDcgtnDH0CSQJ6AXoOcAtsA4IEbAJ9BGEIggJtBD4GTwF0AoIJMwlvBn0MggR0DF0SggJ9CGgCggF6BHcHcgGCBW0EVxVlC3QCcgF0AoIDggGCBHQEggOCAXcBfQKCDIIFfQFL","classes":[{"name":"Bar","id":"FNB_DRINK_BAR","b":0.05,"s":0.080507,"q":"uwpUtA4bhwN/sggsrwQ+4gJT6zBpgQgkugEE/gwP+QEKaDKmCR0nAZ0HLOwKH8wJLf4LLnxNjgYo/AsR5gwztwZ2qAop/goxyxth8DAUq3MYjwoPzA4O/zIK3AIX"},{"name":"Bi-a","id":"LIFE_ENT_BILLIARDS","b":-0.21,"s":0.064654,"q":"0EUs2g9/6AsfngwYmykMnRc62wImvhE72RootQQ+mRdkdWjCAyONDRLDBAn5Ahg/YdQ/GMsDD9UHBsoZHoYSC6MCDu8KCAsSjRVOhxEB+j8S"},{"name":"Bách hóa tổng hợp","id":"SHOP_GROC_DEPARTMENT","b":0.4,"s":0.095425,"q":"Ck+WAgfIA39IDccFJLIFFaEBF/QJHEAYdBP4ARtTGuMDMa0IGJQCHbMFCuQDJqEFJFw3sQUfcyYkLzomiAMYShXVBT42E4kDQxlckAYeORrmARHABFLbAwPlAUnoBB+ADheDCDHyAT7TARO8BhzsAR6MAzaJBgUiKrAJDNYBFf4MR5YEIz4qMyCoBVzMBGfcBSPTAh7UChWCCAuQARjVCBnPEx3UBxIuHLQCBmMN+gII4xAhrQMQuQ0Csgg+uhMDiA4U3TkD7hI45wYZ1wsDxwYlvhIF2QkqpwYZ"},{"name":"Bãi đỗ xe","id":"MOB_INFRAPARKING","b":-0.73,"s":0.064738,"q":"4wIonFI6o5EBf60SKw=="},{"name":"Bưu điện","id":"LIFE_SERV_POST","b":-0.55,"s":0.038026,"q":"kAkAggYW3QF/vgQYKCqDQmvBLiu3E3XHEBfUB2/gGjuPIBfLDli3mgF51goYmjh5"},{"name":"Bảo hiểm","id":"ESS_FIN_INSURANCE","b":-0.57,"s":0.079258,"q":"jQ8Nxz8l4iYgvBUZ7wR1rjZ/xu8BBQ=="},{"name":"Bảo tàng","id":"TOUR_CULTURE_MUSEUM","b":-0.55,"s":0.099882,"q":"0AEzrTFMwwUY/j9/tBIe2p8CE+oSAewOA5EfAvMTAQ=="},{"name":"Bến phà","id":"MOB_INFRA_FERRY","b":-0.71,"s":0.051255,"q":"wQ08zg4vty54tDl/"},{"name":"Bến xe","id":"MOB_INFRA_BUSSTATION","b":-0.63,"s":0.078935,"q":"4wIa3gophT1UjQoY1Vh/j9YBBw=="},{"name":"Bể bơi","id":"LIFE_SPORT_POOL","b":-0.57,"s":0.088253,"q":"xStpxyZ/qWMtqhEQ6wZKyUoBlxgFpGIF8EEF"},{"name":"Bệnh viện","id":"ESS_HEALTH_HOSPITAL","b":-0.15,"s":0.096207,"q":"0QsGmQMj0wYu8iQJzgIdygTJgwzl5Agv1CZwtAgk8wovHwSaAxPkKQiLFjKqBSz4BgiOBH+KFG2pPQGgGArhVgfHCQI="},{"name":"Cao đẳng","id":"ESS_EDU_COLLEGE","b":-0.53,"s":0.087573,"q":"tyx/mwcALjOEWj+1BDjqPxXjFxWbDRU="},{"name":"Chung cư","id":"PROP_RESI_APARTMENT","b":0.85,"s":0.090262,"q":"8QEGlAEthwELtgN/QhXPAQ4VIq8BESwVoAIaRwSFARQiAQYGpgEOEzJOX+0CNpsBMdoC+QYjKB9iR8cDKP4FKJQBDcwBEK4EGaoCMa8DBZkCDhIS/gIp0gEFwg0ZgAITMxN2DscDBfMBErQBCnc1YhnIAvUrE8sDW8QCC4oCIA4lHlXIARbpAjU0CA4KzAU2oAJfpwkw6gUZJhdZMQ4kjgEd5gH5iAZRzAUS+AEm5wMWVQytAv7+BvdsJcwG/oYF+xw22QRSIwCbBQE2IUswyAQNKSwbCcQD/aMBCEASiQIUUWazAgd0RpECAcIB+5gC+ckBB34twwMP5wIF6wZNUxKCATDYAjE3JfMCDtQCA7wDLeQDVtkBALIHAOEC/qEBFoUB9bwBMSsNHBOEASmHCPWrAgTrASL4AQVPJpYKE78C/4kJC+cCA9UFE4wFDb8LAn8C1gMAqAwLqQEO0gMqqwESIfqIES6wBU+MBQOlEAugAgJ4AI4DEqARHD4K9wzmSPznBBG+CRjNAhKAAiDaBArjAiHXBS7YBhOyASTVCv0sCuANCw=="},{"name":"Chuyển phát","id":"LIFE_SERV_LOGISTICS","b":-0.17,"s":0.053616,"q":"3B1MiQJ8rwls1Dxs9gtImAJX5RRB5QwmkAQJkARZtww49gIm3gQDpgRsvip2iww4lwJ/zywI14YBNg=="},{"name":"Chùa","id":"LIFE_RELIGION_PAGODA","b":-0.56,"s":0.10613,"q":"zUb7rRT7yBAAiAQBqAa9mhB//QcQmxbg3w8J4jIl6TcTk3EcuWgQ"},{"name":"Chợ","id":"SHOP_GROC_MARKET","b":0.26,"s":0.11401,"q":"tAgx9gUHoAQFgAQQjwMtsQcjihMEzhwv/RQGtgUvyBMX/AdIzgottgIy+AMG8AQNow025A8MrgtG+wdbogdCsAF/VDUKJ+wUJbcDEO8BBpABEogCOMkFIbQCD4wCD/EXAv8NN6QdBLALDNiJAQTGIgG9AwM="},{"name":"Coworking","id":"PROP_COMM_COWORKING","b":-0.13,"s":0.058753,"q":"6BpPzwgR+AVZ7wprtwhoKh6FUUXREyaNCifGM1l1f6gMT50QJ4IsS6QMOLUzS/wBAvYnONoSE5MEB7cQE8QMOLggOL0EBQ=="},{"name":"Câu lạc bộ thể thao","id":"LIFE_SPORT_CLUB","b":-0.7,"s":0.075176,"q":"+ZIBIIUif/05IqgPQw=="},{"name":"Cây ATM","id":"ESS_FIN_ATM","b":0.26,"s":0.11019,"q":"1AJ/jgX3jwIDLy0FCJcCP78SK6wHK70IJYUKKeUEI/YCKdMJCOURB0EQpyIMrgIEC/f/ChnMAR28DQ6QAQ5XNKMCA7AKRjMQoAPzzgIDrAUksggktwYmrQMptAUw8Acl+AIDzQwFnRcDqQ0gbA+RARukDBB8HLcLM6UcCpQtCtQsL7sJMvoHM/oSH8kCCcgUAJAKAE8f"},{"name":"Cây cảnh","id":"SHOP_HOME_GARDEN","b":-0.33,"s":0.096935,"q":"0AEE+hAzlVAs+Ad/lA4dgBktyBkt8wUX8w8m9glPtzoB5U4NsFkNxiwH"},{"name":"Cây xăng","id":"MOB_INFRA_GAS","b":0.0,"s":0.097667,"q":"mw8w7h8hgwcY0AoZqiUZxwI+yhITlw8B1gMFqAgH7QI+ggU8xQMn5DUgmBd/qQIungQ11wUv9WgB9BwjxBUy0BIzngQGqz5cxQMH"},{"name":"Công an","id":"ESS_GOV_POLICE","b":-0.63,"s":0.10851,"q":"o04n4xcO+lkawhF/ziod/dYBFA=="},{"name":"Công ty lữ hành","id":"TOUR_SERV_OPERATOR","b":-0.25,"s":0.068932,"q":"wQ0shT5wtCA0hhRCrwcSFCjBBhO0Fi3rA03CARiGCTOOBn+HByCRByGGAlOhAgyqCmK9Bxg="},{"name":"Công viên","id":"TOUR_ATTRACT_PARK","b":0.1,"s":0.092384,"q":"OhbeATvBERaqCS2LFEeXCDiYBfXkByLeDgi4CgKECCGJATXXDAblAgJQD7ACIoICJNEDMZwK7PACf+kMH/UDSqwKCPAF8s0BBLsIFp8HVoMB+9UCMWQtoQMNsgMBshAHuxQJvwID5AFs"},{"name":"Công viên giải trí","id":"TOUR_ATTRACT_THEMEPARK","b":-0.42,"s":0.068682,"q":"yxh08iV/xzk/TBCwAif1AyrqDjr2KjyuCFvaBg7kBiXlFyA="},{"name":"Căn hộ dịch vụ","id":"TOUR_ACCOM_APARTMENT","b":-0.01,"s":0.057841,"q":"wgdMgA8OjgM23AV6oQ0vkRUfsAZ/VQaOCjD2A0KACEmdFFS0BmC8A1HfDU72AmeQEizqAx67Hx6YAia0GkSOBH/3EDDeAQmwCTBbDok/B+e7AQU="},{"name":"Cơ quan khác","id":"ESS_GOV_OTHER","b":1.23,"s":0.10449,"q":"CEdEL6oBF24mswIanQMrQQsUGKoBBoYBNvoDH9ICHeMFf/kDJ4kBRLADJhsceQrUAh3aAh/7AfuUBRWkAxl4BYcCEXUfFhuAAzLoAQY1AVHyxwIAKgrdAjfMAR5DFJMFMyUQmAMdcjCTAh+6AU8EMcQBO6gEFWEFdw7kAwNaA7wENKIBRIgBLIAD/7cBOyUDtQITrQEIXTzJAwwNPxwjsQQRywEajwJJCxMfHz4sDB3vA0S1AgGdBQoXF8kBH5kEJgn9kwEqcC/TAfnvAR/RAT+OARL0CBDXAjmgAiPeAiwYGL8DPFoZ7gQiVQY3K6oERgkfcjvuBBXrAhSDCRqaAwbJAQWmAQfoAR6JA+dgDpIBDEwD+AUPrwEBcRtZBPUBLPgBVdQBMuMBBh4r9gIZVywoMyscQR9SJLwDHrQFUuIBDTUQgQVD8AU/DR1uTp0BWY4CBZ4LBvYDGMQOHNwQF/chBdIXF9sHKIgQEc4MzrwCQIkHAYoMAKoCG8ICDbsGANoCDLYBAIkBALkJLfQCANEMJ94BEtQEFewPCYQCIPsOBpoFAfsGAQ=="},{"name":"Cơ quan nhà nước","id":"ESS_GOV_OFFICE","b":0.05,"s":0.073489,"q":"5gET4Awz/wExkAUd8AYkKz2FAzvsBkb6Eg/TAiIgf5AFKPAFOy8FfDXcAwSHAQ/uAT26ATPgARn4BR1PCJkEAMICQpwCK80BHwFUVhu6AyKwAVzzAgbEDg7zAyK2AQueCk5fAqIMBnk5uwMLygMGqAJTRC3FBB10E78CC4gDNo4IAKoKD/cKFogEBoEDKeUBDysv4gQEsgIGjQEe5gUN/AUTKhjBBT75AU6dAgu9CAgUPCYhbWHwAwLkAwyNHgnyBArnCgG0AR6jAhhaDMMJCMkCMbEFAY4DF64ICOECBq8BCNAEMYEBNJAFCbASJewaFsMONv8QD50LWIIBEdIGDNUCA5oGQZEVOYIbF3wt"},{"name":"Cơ quan thuế","id":"ESS_GOV_TAX","b":-0.66,"s":0.095744,"q":"w6YBCsMhf64ICt6oATQ="},{"name":"Cơ sở giao dục đào tạo","id":"ESS_EDU_OTHER","b":0.25,"s":0.082021,"q":"rAMiog0h6Q8ksxD0+gEomg4MoBwjgAdC+wQriwIV5wFu1AEW3wYmb0ueCkbjB3+kEQMFSXES2AUmrhVsywsX+AUN6QpGM1OgCC7VDCCmBwLsDA+MPwTTDdKRHweoBE+IA/rGJAiQCArWCgHODv3kI+7QDO57Ag=="},{"name":"Cơ sở y tế khác","id":"ESS_HEALTH_OTHER","b":-0.37,"s":0.052554,"q":"0AEswAcm+TxT5wZDrwQzuwsZ4AFTuyAwiwh/mxdnswF0+SMqzQwcsysR"},{"name":"Cảng hàng hóa","id":"PROP_INDU_PORT","b":-0.73,"s":0.065039,"q":"4H1/82tKxD4f"},{"name":"Cắt tóc nam","id":"LIFE_BEAUTY_BARBER","b":0.64,"s":0.070024,"q":"zQwLpAsTuRwAeRGiAjkcLe0EFOYN+soCF7wCw6sBTYUDa4gBfxluKDmMB9yQAjb/A6aCCUH0BvuOBGSQCxDxAg+/BERzQN0JApARKqQBPEcmFQGfAwSwB+zAAhrBBb7oCCeQCHpmNJ8Dvy0KpQH9KVEDd289nAML/gy6vQF3ywI26gcg4QMStgcOKwpEFqQCP+ofFLgJGckFM5UGSOoTAIgEBPkRE4wZfpEFCqEDJNkCAZcHZa8IM8wIJ4cdE+YEM6EcH8ICOGYElwUrugUp/AQa"},{"name":"Cửa hàng thời trang","id":"SHOP_FASH_GENERAL","b":1.9,"s":0.097484,"q":"zAIP5AMdkAELREVVIXkwCyGMBD/zAQQvFt0CINQC+J4CL6ADQroIMGwc/wIcrwMgrgUi5wE6iwlHiQMEyQEcfi6AAyqHAiG5BDiDARkPc8UER5cBQbYGICtBCxOgAiX0ARY/P6AELvIBKpkCXYoCB+kDEeUIBt4CGb0DE4wJNNsGF80BDDklzgHuLgqZBROpATGHCCXUAUQV6pQB6i0QFQXTAiydBCkTDBUrgAEK/AFUIzHbAjNYGvMCAxAfJwyoCDniAUCFAyVGQkItES/AATYHJfQDWNsEAxgIpAEhRijdBDUmHSkRODWTAxZgJ8oBDqwBCwhAHS+vBGO6BWPyBDrzARDBAQmLAWOeAiTeATASHLsFBEAGigENhgEAigMW6AL0JC+zAimhA+vXAwWTBAdeK3UFzgUyHhC0AvnQAQKXAkeDARCBBQEuG7UE+tIFPqQBEhEWFQPSAQn+CPbPCySoDCKNAgmXByz+Dh95Fs8DAuEBEPwC/OcEEogDB4MIFKgEDqoE/7QGMaoCCn0Vlwl/mAMZkQLqrwYFyAIJYgzWASwpIsABPZMB/Bb/2gczkwMQlwIclgEQ6AUAChghKws3eQiIAiqdAyGLARHyAQ6pAQ3LAQO1BBmVAiWaAx7bAwW+AdVOAtkE9CwQsAcrLCdeEbkFUcwDCQ8YvgEuvwUMKfaAAwU="},{"name":"Cửa hàng tiện lợi","id":"SHOP_GROC_CONVENIENCE","b":1.46,"s":0.11324,"q":"8QEFDC9nNwoXhgMTJATsAyiqBEoCT9YBFIMFE8EBAFkGBwPzBCikAhPJAgHFARaNBDM5ClE0Ov0fF94BJukBDqQBE8cBGnENnAE4xAEVjALqqQb9uQFbEyjkATAnFpACF1f6iAME/AEUogEphwI4KTWvCCrJAUF9/Q8ZDgKCBgLrATgkfxYK7wMNZQ2GAg3qAS+OAfy/CBcoBLED784CA3kLnQMFLhdFF4sE/rQBE4MEHdIBBbUBGz4gpAERwwEvFCqwAQwrHCgi/gECzAEKAid8K4sCQSgEzwEmFB2/AgwCAmQrvAELpAEvWAqrAQg1KaoGHykOuwEbkAY4Vg+TARGtBChLMzRPggFLbDW7Axn9BRMjDRIy+AICzwL9EQRGQuoDBacCDW0HzgEU9wECJgqNBv0TFmkcMTdAEuMHDQkyWvWoBSTQATQkHcgEIpMCLZMDBCURZgLNAREYEXoMlgEOiQH9swMUgQE0kAFvJy8oLzlUhQIEFQWBCgGzCwy6CAUEA+MEKvwBCLEGCPYDI6AQD7AFJigApAYChQIbiwICcAnuAg/fBfwcAvsDAvUBBoEPI5QDA/cHCIAQ+IsCEegQAO0IAasMCLAFA4YKDdcFAbABB+QBJNwLF5YTBOYBAacFB6EDCPADCJIBDb0DFJMBCFsO"},{"name":"Di tích lịch sử","id":"TOUR_CULTURE_HISTORIC","b":-0.18,"s":0.051742,"q":"rQFWtxRVzRBrpzFN9whQ9wNEugNOnhF5vAVOugQAswEWzAcnvQ1C3ghNvwMs/AISggk6zRkIhwNRiRFB3Ah/3AJegXYMp3oM"},{"name":"Dịch vụ sinh hoạt","id":"LIFE_SERV_GENERAL","b":0.35,"s":0.072866,"q":"PGX9AUuWBjPzCAznNEnUATQ2CO0jOpoDRsIGEJEVc4YBFIQDRowKCaMRbZMIMY8BVYQJW5Qmf6YDEOkFJKADHK0FapIBHPqvAQOCD3qpKAfCDU4="},{"name":"Dịch vụ xe khác","id":"MOB_SERV_OTHER","b":-0.2,"s":0.050232,"q":"4wJurQZKigcG9SAvJiqEBzroDUqtAQS6DnCvDk6WEkvYDH+pBBh2K6cCbAdv9ARp9wIjpRZ85wQtTB36QAriCCisAgiQGUCVCii7CED7IxKXQzOHMBXsDhiEMxU="},{"name":"Ga metro","id":"MOB_INFRA_METRO","b":-0.58,"s":0.057571,"q":"wzwHuQ0a2QJeswpg2Qkr1SQFiAVD8zpJlQl/jRs2xD4NfQbIBTTQxgEb"},{"name":"Ga tàu","id":"MOB_INFRA_RAILWAY","b":-0.7,"s":0.071911,"q":"iFcB2QlCjBN/xi8m7D4nnt0BAA=="},{"name":"Giày dép","id":"SHOP_FASH_SHOE","b":0.5,"s":0.091514,"q":"9gEh5AU1vgR/owsj+ghdmQpEd2jYEhDiCRH1DB7mBBPxBjHXAQT7CD7XDTJmD/8CGtMDA+UIFZ4JV8UBKNkDNH0JygFE0AMG+AIIhwYxjgMozgItmgIQ7xoL9wUDqQEWwwIbAVcKH/8GMLsQV58YWcoGKMMNRLjXASw="},{"name":"Giải trí khác","id":"LIFE_ENT_OTHER","b":0.81,"s":0.071902,"q":"aUmkAgAeMaoBLQwAvwIRIAsuf4kBIKQDZ0sp8AREET28Ah3QBhvSASi+IyJSFcwFDK0BFOYDPAQGpgU1BBXbBiRjHe0FMM0BCeEDIo8FGLEBAKIBIIMBJZoDO/8DATsMMBHADSDQA1n6BBnlATDdAhonG2ExgQVgoQdbuwU27wYk9gNEkwoNxAozXQZCAagGJMoKQaYBD94DOB1z9gVLrQEZ9wV3kwMOkAQ4OD7/Ag1wIPoKNLACOb57HeYcAfAHFpgDHcETCf8ICc0QVLEvDQ=="},{"name":"Giặt là","id":"LIFE_SERV_LAUNDRY","b":-0.49,"s":0.1331,"q":"5AsPmggBoQQD9gh/GRe+LQWIJCDFsAE66RA6lIEBHg=="},{"name":"Glamping","id":"TOUR_ACCOM_GLAMPING","b":-0.75,"s":0.065436,"q":"xmB/g0p0"},{"name":"Hostel","id":"TOUR_ACCOM_HOSTEL","b":0.16,"s":0.12416,"q":"qgoRFQ2nAjb5Cn+LCD7TFAyvBEfZAkaeDQ/VAka5ByaTBwwhNpoVBZoEBvsFAa4HBuwDB0Yfjx4XvQ4E/hAXmAId+S0BwAEmjgsmiS0EkR4I6wQEgQMCykMHyQUB"},{"name":"Hải quan","id":"ESS_GOV_CUSTOMS","b":-0.53,"s":0.060519,"q":"nyx/qC9/7FJ/7iBeqCwc"},{"name":"Hồ","id":"TOUR_ATTRACT_LAKE","b":-0.3,"s":0.12581,"q":"mAINiw5B0AwD8SR/ywMHuBkC6hkkuQILhgQLyhg04wYWvzMHhQQakxYM"},{"name":"In ấn","id":"LIFE_SERV_PRINTING","b":0.01,"s":0.079595,"q":"9gEZ4wYtHizSAS25CwuoAWOfAQrsGBHSCRTOBUCDG0GGFkaMCTe+HkfiCguPCQT4CBM8IOMLEZEMCt4TB/gCSsQTf78GBcFQUuGSAVL/Gw4="},{"name":"Karaoke","id":"LIFE_ENT_KARAOKE","b":-0.09,"s":0.12581,"q":"jQMkmR8UuUwnriQFqQoE8w8p3QI/gQoswjEjkQZ/k1IKqgQMzAgM9DUI/gMK7ggGlg0GtCIIgxIM9hUImBEMFQY="},{"name":"Kho bãi","id":"PROP_INDU_WAREHOUSE","b":-0.6,"s":0.068436,"q":"kAlNigcSkwVk02ItwB1/0Bw6rKwCMg=="},{"name":"Khu công nghiệp","id":"PROP_INDU_ZONE","b":-0.71,"s":0.053656,"q":"wAcbzxQfgE1/zRp/"},{"name":"Khu phức hợp thể thao","id":"LIFE_SPORT_VENUE","b":-0.5,"s":0.073639,"q":"zwQQ8hYo2wh/nxYhggIkvw0Mmg0nlQIHvCMmgBUdkgFk1kURaxT2DWk="},{"name":"Khu tập thể","id":"PROP_RESI_COLLECTIVE","b":-0.2,"s":0.061026,"q":"1A4P2wkwgAQ6yxY93Ad/hwdslhBM8i0hkBMgth13pwRFxQdEyBc60w9J/AMavxAUiJQBDQ=="},{"name":"Khu vui chơi trẻ em","id":"LIFE_ENT_PLAYGROUND","b":0.52,"s":0.096974,"q":"mAIe3wI4nAkdmgYypAR/ogI/zANSkxUF+wQWsQxTqQVTsAYijAgHdw+qAxn9BTjXFTiDDSW0ECymCxs9LEMLmxUzsQEWyAkGxgkCnxsJlQsZlQZK8xci4SYWoycLvQEaxwEatwUa2xwO/woV/Soa+ywW3A8R"},{"name":"Khu đô thị","id":"PROP_RESI_TOWNSHIP","b":0.41,"s":0.071541,"q":"uAEylgFkygMwiQElkQ16lQZGtQJQpw0zvhYffHTcAjPkFEj/CAOkBgJMH7oGH44LH5QTBfsPH6wHA+oDAUwOkQMfuxQrmgFC+wMM7wUkqAQUgwIX1QMf9AUflANwywIJxgVyswIm3AFIwwEkwwV/r0AItC0I0D0LjAQIuyEOsAEK"},{"name":"Khách sạn","id":"TOUR_ACCOM_HOTEL","b":1.19,"s":0.12187,"q":"0wEL1wgcFUinAn+zAyWWCCCIAQq5AQHeAg2cAu7fBhQUC74GEtoFAfMBQIQE6dkC794DAJsFHQb/+QUFe+2nAgawB/TPAfw4CoIDCw39wgQHRB/GAQTkARFTGI0E9mspnAMAkwYIigJmowIb2gXchwPvPmXAAQDJBAIEE6YE29YDAJQFAI8GLNkH94kBTj8L6gQxngYJ8AID9QgD7wEAwgEAwAH+ugLohAneIAWSA/zPBAySA/KEAvIhAIcCzr8JRfgIBMMDCcQBBPgCI6MBPpoDHdcEAOgCHUQGwQIR0QEL2wQRqQwctiv8qgkQyAEP7Acf/QUeBBGSCAPqCg3BAQ7RAfK/AgmCDxDlCRCiBPIwEoMB28AGDbYCHqoPGYAGDuwGDp0GBsAFHuwJDcYTA/AZA70G/AYC"},{"name":"Kính mắt","id":"SHOP_FASH_OPTICAL","b":-0.41,"s":0.10951,"q":"5wIv1wU/lDJ/wD8o0Tkx2BUo/w8xhwISrXgB"},{"name":"Lốp xe","id":"MOB_SERV_TIRE","b":-0.23,"s":0.046614,"q":"1gcRoQEOejiRCk/tBTIvRpssYscxI9kaOMgISdQMT8oEJnhpjxAa+RRQ+xR/kw9B/wQQ4gEoxAIn"},{"name":"Massage","id":"LIFE_BEAUTY_MASSAGE","b":-0.01,"s":0.099078,"q":"tQMC3A4q5QUjpAgFwgYArxMo6RoexxYhuBE+7RkqJH/8BilaKlU6oAUf9gQC4wgnzgEIiA4E0x4bWg6vAzTWCSrMDEE="},{"name":"Máy tính","id":"SHOP_TECH_COMPUTER","b":-0.06,"s":0.066566,"q":"6DFP7Q4h0Qh/ale0EzDWImDuFQzJAk20EFibIiG5GkyYBErHAyf+DG2sPR6MA1b4KSemggEnnw0MsAs+"},{"name":"Mầm non","id":"ESS_EDU_KINDER","b":0.41,"s":0.12514,"q":"wQEHtQM0mgTpwQIV3AnjgwYHuQkPjQLx8wgFpREQ7AQP9AwmnSP2WPrVBQUgAOYIMYUE+BwA2QEHjAcNgQP4+QwGY3/uAQ6wBxnPAwMJc/EG9ugF+LMC+aYDArEBBI0CBSl5ICb3AQOKBAnDAxr6AQGaA9T3CDcIAb8BIdUJDqMCC9UCLLoJ35wBLbsFD4cTCEwA/EwOpwILuA0NgAkDrxYKuhsIqwwhyQgH0iwC"},{"name":"Mẹ & Bé","id":"SHOP_FASH_KIDS","b":0.53,"s":0.082599,"q":"zAQExwlH3Ao62wcLjwtVgwFjwghHkgcImBtNxwIxywJC1xIfjAUNyBAI4wcJuAICpgIZqAwe+wIDzBQJpRB3qAtj9QYFqwoG+AcR+wEQzQYf2gEfwR8nyw8CtAQnig453wkWsAsWqQEW5RIesSEW2A0nqQQq8gYmFSm6CCApBMUDEQUg+QkjBRfHDBnVGX/JDhbqBCfGAxaLByaLBCY="},{"name":"Mỹ phẩm","id":"SHOP_FASH_COSMETICS","b":0.77,"s":0.067143,"q":"QV/MAg5aSYMBKsMGMCQ3jQI0dhNPC6INC5gFLuEeNQZn4gJa3AZltwQ7ugMgRyLLCGzYBz/UEC7PAS34AzyPA26PBBsWOtsKIqMCOvwBBPsLfN8CQ9wCZU0elQUixgEZvglAGUT1BBPBEAOwBwm+BUw3NqMBM4oFU9YKS6AJScACIJoDJu8JUngBWEgjEO0MEPoCB4U7BvcBENUIELYMEMQJDfIdAfIOEN0LIdYXCVwZGxCwGBPtFRXJB3+MDAGHAQk="},{"name":"Nghĩa trang","id":"LIFE_RELIGION_CEMETERY","b":-0.71,"s":0.064933,"q":"tTEp4kt/vAcw3T0s8iwB"},{"name":"Ngân hàng","id":"ESS_FIN_BANK","b":0.94,"s":0.14688,"q":"cATkAfGOBRG+AhKcAveiASFoDbgFDaEEENEEJdAIAWf4sAL3xAQAngQi+gIBowcN+AHyJwPUAh3hBgTACQ3HAwTKAQHCBheQAgS/FgQyKqEDKlwDqQX9uQIRiQcq2wE8ewQRDtsC9IAFBiMvgArp0wn4jgEE8gF/0wMOzgInqwQEfQ8ENuoFAvgEIocE/l0ALiXrAQE357QF9LwJHLcZGLkcCrEKB/IMTa8JB6sGAiQE4QQHhhUGggYHNAfhCwKZGQvMBgTGEwLsAQ36BEa7CUz6B03+EwQnA54BQtYBA+MGAa0DA4UGCbkGBJcMBdcOCg=="},{"name":"Nhà hàng","id":"FNB_EAT_RESTAURANT","b":3.55,"s":0.21393,"q":"LwYHA0cCdAwDACwHShwFDjceD/2GAQgU/w4kBPgQ/DwJLBCtAfRBBhIIaO8sEQj5jwEGGgMLAwUAMBEKBQr+ctUzBmUQiAEDG/0L8yH+CQAk9xb3IAwB+QHqIfpgE6EBDRgcXyyAAQNa+ioHCQkdLBcIMxcb/wkCDgsIEyoAQAEhCxH3EgcWCwL4DfrCARIl+AEBISAG/xb5JBH8Af+IAfBF/tQBATUGFiM4AgX1IBwG9H/3BhABAysSB/yEARcq7joXDPgVFA4IYwlCF3b8AQAOA2YMYAI6BT4FOgJ/+HXuigH47gEADQYpCKoBCEcBW/5KDQIDfQR6+ioWB/8BAhzvA/oZFW8uMwY7FJsBCBYRB38BAw0FM/ucASRRDwn7BgofBiz8G/kn8F8HEg0JBToMNR4HFDAFWQMyCjIWuAIHcglLBD33IhUf7m4TxgEBAQJxFTgAEAMFAkbzggIMNwRpGTL5SBo76x4ECwpR/VUQGBQV+xUQDfheED0LAwsHAUodBfh2AgMjAhQrAG0JFQsNCxMGOAQSADMPCwQrDi4IDQoKCUkMGgQqCdQB62MINxgOAI4BAVERSAwP5SokYPs6A2fnRg8MBBMYCQRi+EYMFxh9AxP9EBQG7QTrIRKdAgxl+AoDhQIECOp1AqsBExwMIARL+UINEB5GBHsnMgJHEyYFKyEyDh4HQQk3I4gBFQotGQEqEFMDMBwU9AsHa/GbAgaRAv0BBBgKeQXhAQKwAfgjABQEAQFRAhn6A/wHET4PBw0KFQcBE/4CCAb8VQYTCBcFBxEdJmL4VAol6SnsBAYa+kn5jgElFwURCxIJUQxV/rcBCQUNBv8XAhwDLf8aDREDAvgKGEL6HBYWBwgQ+gH4MQhNCgn6EhY2AgkCBSoEBjkHdQ01A0L1Ev8mCgUJIRgtAhIEBAMbDlgNlQESlgEKVxVJ/mD5KwhsHnEDpAEABh13EhYKJxYD/igAgwELAhwRCmEBSBWuARSCARI8+jgIBgE2IDsOBAMgDRIPJQ8GDwP3Uw0c+wkCVfYQDScELwIXE1kGQQVFARwJXi4GJhgMWQMBBFMUKO6gAe03BD//Sf0X/BQMJhMBAVoLUSQ4CCgROxEb/wIIKv4JByQAORJlAwIBKhEfAH4ZHCFSCRUDTQ8L9AEATwNLAAMYHx47B3QQEQNLAQgmYgB6ERz6Vv0dChYAAfdW8BYBHAgUBkv9FABHCyL6DQkbBArtN/8EEwMsKOuRAf9d6mcCLAoRAQsGO/lMBy35CwcEEz8GEvkQBjgKjAEIDPwCEQ33JgMX/EIpCAlBFioDYQpoBTQMHQI1FEEJTQoG7gwMSfkVFjcpVgxp/i0VD/xXAAsECgsbFQ8GkQMDkQH9QRImERcJYgYa+gEVJ/oJ/1sIexFrCzcCaQ9kBxQEDQARAngLSgADB48BBwEBmwENnAEVFf0T7Aj5wQERCQg3BDLuXvWcAgI5BAoKBQM5/AIBGyEq6QP8SQIaB18CGf0rDGoCqQH8CQM7BibugAH+WQ08+AcEGfqKARMhAJEBHykGYwQU9AYIIwBH+5YBCSsANx8p+BYMFRAHD1n+OtcPFAX7SgpABiniEBMw+jn6A/wWC3bzRRIbAxUEBAUFBj8FCwIwFiIEE/Y0AJYBBUgcQwSPAeYNDBMJpgL6chsZ9fsC8pYBBDz9AgEF/XQSdA1DAQT+NvgTAFQFNRMN/V0BAwCBAvoR/3gEFBEz/DYOMgFFAE/1Rv/dAQVHAUstygMeWhaYAQNZBQgREwGAA/bvA/wtBmkRjQEFOQ0/AJEDDmj58QEDRxc1CBcbJA4q/gP4GA9fCTkErAEaDgrqAQBSA3cYHwYD/JgBFZcB/VIRjgEUxwEAjALuVxISAS4NnAEFAgMCBEMTew29AQKwAQpo/gwAWRMKD50GAaIB/i4DUx27AQ2NAQIyCUQO/QEQ+QH9vgEDHw8j/W4R+wIFA/8rGqMBC1L14gL1owL5yQIOswEJtAEJIv4eCAr1XRBH/2IBNwwQ+AcKwwEEgAEBff/iAQc+Aa8DHRwJnQEAEQe6AvWZAQEF/z8IpAH+DgAXAZUBAZIE+YsB7xEBQhU2+J0BBnIAQwUL/QQICQT5Av4UC4oBAAUBRwUXASj/ahOyAv8P/1gEDgEG/Ab2GPYXAZEBC3T8FgT2AgQ0AyYD4wELUA6IAQ8YETkKFwkw9z0NlQHrzQEBjQERjwECHxcoCMED7xn8JAlBAiEFDPBICHkA1QEJhAIOPf1aBin8Eg2WAQMrAakB/wH/lgEKCxEP/PkCFZMD8VP8CP6CAfYZBUj1YhQJDn8m/QIAJw8WBV4EL/ZyAQ7uVPgZAQoKXAVUABneBxUyAMMBDzYHwAEBUR8s/n8AEvCjAQAfA8oDAo0B4FAdGQ1F/zUOJP63Av2EAQMeFRQGHfvpAQDiAhF5/xMKLQE3AYsBDRr/PAWsAw0MGiIDUfJuEBT/JP6kAQPbAf8DCyX4AwhCDikBNP4hJJUD97gB6Rn7JQhFFG32CwYiGBURYxUkBFoPaRf3Afs14RsUWQXjAfZWAI0CAYABExsJgwMRDQ8GFA=="},{"name":"Nhà hát","id":"TOUR_CULTURE_THEATRE","b":-0.6,"s":0.076447,"q":"xD5/7Ud/9LICKg=="},{"name":"Nhà máy","id":"PROP_INDU_FACTORY","b":-0.24,"s":0.062291,"q":"2whGggF/hwwpyxMFoDcmoANOzAMFvwQxvx1S6wlhfCS9DCOICSb/AgWHBjCVDR5+VsENJ+AOJokCBLQbWpuKAQmLKAXzMAqVAwc="},{"name":"Nhà nghỉ","id":"TOUR_ACCOM_GUESTHOUSE","b":-0.46,"s":0.075562,"q":"5gxnjRADpi8/9ghaphIZaz74FRSDAX+zCmfdJjXZGGTbKzibDQn9SAL7Ixr4HwrDBwCVNAY="},{"name":"Nhà sách","id":"SHOP_HOME_BOOKSTORE","b":-0.37,"s":0.10012,"q":"oBF/h4EBPIsoQM0DVuQ1XpCXAQ4="},{"name":"Nhà thuốc","id":"ESS_HEALTH_PHARMACY","b":0.52,"s":0.11653,"q":"EUDMCj4aFIsL+6ADBqcLFJ0FEZgHJpYDGbsBDbEBC5kBI9YKD+EC9EUpCwxRCrYBIvEVCPoBAJUJ9YIDFAwOnQ8OkwERRUi3ASQD8sQBCOQBBHV64wYkohED8QIUvQcU7wICrQ1/+AhZ3QgnnQUAsRMAjgkP+wYCmAQHiwHn8gIR0QMC9gEH3Bf5lQEV6BkGUh2jEg7LAx2LB/rtChr3BiXqCAqZByLvAgoBDbsBB/YXPq8BAVYv5wELhxEELAnQGSKlDBOJAReEGA3eBwHAChToAQ8="},{"name":"Nhà thờ","id":"LIFE_RELIGION_CHURCH","b":-0.57,"s":0.12426,"q":"5gcHvwIt3AQI7p4BDLU6/9wCf7AEAcwgAQ=="},{"name":"Nội thất","id":"SHOP_HOME_FURNITURE","b":0.7,"s":0.10188,"q":"pg0vqwUPwgoTigIwpwQJOhXWBPKrAQONBw3RBhZB91V/5AouKTKiCieDAgjqCRG0BzqDEBP3AigZDewGIKkEGeoCCZwFEPsIMNcHJ9MLL7IBd7kEJ7QEIvIBGh0++AEE3gIv8gcKmQkuwwo2rBAA+QMnjgI6zAoSxgRJ5AEQrwMFqgHz7AxLyCYvyicGqg0DwAEQpwUDyx4u9gkBqQ8Q8REQ6QgCizEJmwQvoAEQtQEC"},{"name":"Phòng gym","id":"LIFE_SPORT_GYM","b":0.88,"s":0.13501,"q":"EAeRByaoBQPQAxw1BbgDGSQElQQZCg7SAibDAwbLBwunCw/sA1bLBhmZFhKxDgTTCgeNCB6QBQ7VARnCAgGVDwmUBhmYBC60AQWlAiavBRqrAkxyCvId54gL+4MBBgcOlAQQqgEE9wT54AcdWt/fDxHAAR3pBQPeBB63BT2AFQKcBwHPBDHkEA/GED3oFRynFgXUCgk8GNgLAeUSBu4VBr0GBZsBH/QCPYwTB7IBE8ADGIMOEK0Bf5AFPA=="},{"name":"Phòng khám","id":"ESS_HEALTH_CLINIC","b":0.37,"s":0.09556,"q":"5wNU6QNPjQP76QMnR8nOCRrCAw/ZAieHDhCjBAWrDjPVBn/FBypOCawX/c0JKrICL/0WGdQMzJ0EfgYAxwJpxwEvzwEY9AhI0wEjRh/ABfeYCOHHAhWSCiDSCgmyAkeNARL0Cg//Bfr6EBaIAkaDATTRAw7yAy3iBQX0Eg+bIQCkOg2cJAaUBgabG0PBDhCJLlM="},{"name":"Pub","id":"FNB_DRINK_PUB","b":-0.11,"s":0.10505,"q":"qhQo/QQegQs6mxY9RAyfKQO7BByKNH9EDPkfH9gRDO8DHqQSNY8BHv4LDL0iB8xZNZYLPqAqA4MgCg=="},{"name":"Quán chè","id":"FNB_CAFE_DESSERT","b":0.12,"s":0.1036,"q":"3gb5AXZhFskBGfwDIPoMEuEYKvkC5d8E+OAI7r0FK48DFKEBHL8JCC8ltQkF7gEqhwE9tw7r8AUClAYKqQ0GpgfzEg69BH+ACCmJCgyGARGUDiu8CjnnCBfpBSi6AgGbF/rDBST3JwuKJzDsIBKwCx3HUA4="},{"name":"Quán cà phê","id":"FNB_CAFE_COFFEE","b":2.3,"s":0.099749,"q":"CNk3NHAuAhAfDyEFnAHHaQWiAg+1BAJgE+wCBl8cKwUNM0c42wELEArSAv1WGbYB7coBDnwFwQHmGx4G81sztAMPK0qkAv9J1fEBK3oQjwH/HS0jCX9X4wILzQIBARevARogL+8BAFYpgQO7EO1CDh0OOBdCZIkBJXj7sgE0mQEphgEf+wERzQT2EDt5HoYBIh4oswEgLCawAxuVAi9DRoMBTG8CDP+/AUNOBjwPzwMliwFRQgtzOBv6xAIT6gP+VDCyAftXMiXtiAIjkgH1EP+GATPUASQC+v4B/PYFzf8CL7sDYx4XZktPEij8ajRN/z0PTy+SAWHNAgMpIVX7FeNNBhEg3gINb+8iEcACAskBHRkHsQEBRwLKAnffAR8gOswBJED+CQ0YOagBO6MBFKgCMmZDYX8xE7UBDUMzgwEFXPd/UbQB9GgKkgEkPlXIAyTAAQ6xAh2YA2RE7psC+oQBBk3kjAHhfhRN9YkEXrsBBfIC9yISJSL3AQIBOJMBVjL5pgYDiQMBMCKlBl2+AQB6+oMBIogBAHEMPDV8BYIEBtkB/zEGkwFHZPzkAvgi+QES7gHVrAMENjWWAf2IAf+nARAdJQMkkwEaDhavAvMmIhL/A/QmFUoNiwFChgEHIB6IAh+KAiKyARVAKMQBMKUD4jLtCQsKCc0C77gEB5kIFnckqAMGbP6zAQCzAQ91FcwDENsBtZQFCO4CDxEW3QUAvwESEwLVAQSgARMaBsICIVESrQIaywQQfAM8/hIMASWMASbYATHJAgjuBB+CAwVhBZAEBdMEDaAEBFIQZi3BAgGmARrOARZiELkGCO8CIEtatQMCyQQoHxDGAwakAgsDSWEGYXnuCSm0DghhBawDMQrxmQMQswMEXiDdAQViLhgl9gELqwIXvgIdswLnhAMHggEGb/TQBPq3Af8bVwYurwHuAvjVAg4lC8wB4eYBHVQ2TBXlAf8SDMUCBucC+LAF/uQBDZMDNooBATIVARYCEOcE+aYBWkTxFBaMA1JkFsIBFFIQCAGOBQmEAjbjAQ1JEJMIPs8BA4gCGLYBHOEBFSYEMiIK6PcE8Tf++AUGQuE="},{"name":"Quán nhậu","id":"FNB_DRINK_BEERGARDEN","b":0.13,"s":0.094032,"q":"NAI9MZwCIKEHZOAEf9EDOO4By4UR/PEFOY0GV1IzowXuOmu7BNmYDC7hAgy7Ad6nARbxCkGjAQORAlbeAQJ3D4MBJZQEbJoKZ7UI9dwB9aUCPSEuowIEvgI87gI33gUI+gEYWBVFMsUIRs0GOrsETK0C/ZQHElwJjQMVaRymASqrAhYdPqQF2JQCL4MBLvwHCqELGqwRAtUDSaAGJZkBHRgQiQUnYAKQDASMAhDyDAW8A0aZFsXFA1eZCgKvBEOwC0OvAw6DEwSEAQGBBhjmEQOBEwiWDxaqAeSXC+f7D+K2AUSfBgXHAwHyDQSuBga7BwurIgI="},{"name":"Quán vỉa hè","id":"FNB_EAT_STREET","b":0.65,"s":0.092834,"q":"jAE/4wEHNw2zBBngDC3RBA/9Bi1DCWww5AEAKgHkAgm6Cg7GAj6dBBK6Bi3SBUc4E6oEF/AFDvQBGLkFMrgBET0ksQI7xggc/wQkOzlXFwsn+QRAtAIrPTKUBA2fAh70ATKXBh6gAQn3AgyeAyS8AyDJAzmuCAbyBC3eA0ScAUSxBATgA0egAhFCNccCQLUDLZICL94CJscFNJQEE/IBIp0CDbQBGGAT9gIE7wUUqgRxmgo30wEoemIZDpcCDzVDhAMgjARBA3+dCl4wGG4x3wEcgwMZjgE3HDvwAgQ/A80UJd0HDO8EILgGDtoCCY0FFY8BA5QFCvUDCvMRA/UFFfMNAKELBQ8P8wIBjwMN6wkQigsWlgIViwIM1ggD3AMNnAUflwIBiwYMxhIOwQQUuxwLdBGnCxKoBQOYAgywCAOWChBCBQ=="},{"name":"Quán ăn","id":"FNB_EAT_LOCAL","b":1.86,"s":0.092794,"q":"QfsL2SUnDPepAimcAQcNFhILTPIqUcoBzIUBQhsWIisK18EBHjr8CiMiJ1BiWA0uXOEBMS0UNyYiEzoDeFgcAkuoXzPIAgBHDAwLPflkEw4fKhENFzUPWQFBExggPhW6ARHKAfsMQkIBBl48E0tF7wE4G/2+ASChASUNDDrmDC++AjkPFWbXmgH1LwjvAU3gASUXaioueBEZJiHzxAJRIxYOEacBLM4B2gcvGAxlMSk6rAEDMtdCATUuGTvpAX4CD2o/Jzg7GMYBJzkIMgS8ARk3PwIraRVFMTg8GhxuPEAkIk6NATGOAQYlDAoQswEZPAsfAt0BBCXwN/0W9oUBJAM5AgFa/iQIHhMo/TQYQiwHMTkEWVa9Ag9TFz0SOOs4xEQEEVgaAzgAGf8gByk2KAkcOgQc0gIMJiGnAv4vDKoBMmEFUhgcEx1QXwgSPQ8hIh2mAQIEKyH9gwE3E1XfAhgOH5UBHgEEVO0OPaMB9q0CIg339AHj3AHpPX+lASQvGFMERe4BIb8BboQBTBofGiZPEGgKAiUhJSgkQU5W+6gDAQzqNQUwASQEHA9WQwe+GytoOJ0BH3kKKVi3AsFI8hb77AIUEPlfJwn3E/se/xAnJRUY/kTDUTh3LHgs/wHmMATxAQwQAhPLMii+AQ6NAQQFKj8dNwIzCygMKgIEAqEBCREipAH3vQE0cg0rGC0kVfMRBnURngIBowIvzQEFffZmJj/XNfg/7XcDOSpQFhYSBiVBAAEadT03+ywoczQ1AgtYHicdRrMDShUXlwHMBPWaAQ5YD2crrQUwcQUzAismUkHGAcQRbBEXKBMKEx5CuQH/fTikASULx5MBCSELhQEKIwunAQkmNRTTTR9wAokC9WMVBBSZAQp2WCkJCSaNAQsbHYIBYggjHkUNPIICDxcRrAEMXwMQAZ4BtRE0IT0b2DARW+1OCJgBxZEBXw/miQL7RxEIIHr9XTNJGEpOF2t5CdIBLKIBVwQQxgHwEFVjATYYhgEyCFfeATsr8CEVT/WNAlJPGDENDe0581UmGh6YAS2EAQl5LDP+FDopAgQWCTaiAeAu+2IDKSJJAa8B/44BBwYxQBcHFR0fDPUi9FwHGk9F9zv3PfY7PRoICBeNAwNwASD4jAIvKxKDAgXwBQpNCIgEDowB9psBCo0B9QwDQSiHBASyAupa+A72SQiiAf2vBxykBAMXGcgCD48BGtUBBYUCM8cDDF0jOBkz8OUB9toCBqMDC5kC5eMBY/kCGZMD9FDgPwneARqDAwzRAxoWIlgp9gMEOiE648YGApwBClcOmgIWVEW7BQm7AwrKAWBrBfsB/YQDFA83pAQZDfmGA/aNAiMRBoQB+50BEckDD4oBQYwBD/wBBroF8roC6nEEUhYUIzsKW+7DBfeHBATzBQbBAxrrAQ6mAQPcAxoN8VMBmgIMDc+1AQYBBrABAeIB05cB/qoDJyoBxwH+oALYE/WCARAxMBHtOgEkL1IJgATuSAw4VF0PhgEEWgEw8zT9TCGCAQY9CXDgjwMEcub8ATbtAx+gAgm+AfsFBAYMbRAwAK8BDpsB/RgZoQU1pQL64gPylgYDev8iBHYCjAML9QEUZCcoQO8BAcgB4K4CAqoCBw=="},{"name":"Resort","id":"TOUR_ACCOM_RESORT","b":-0.74,"s":0.060996,"q":"5gxkqh0qxlF/hwNB"},{"name":"Rạp chiếu phim","id":"LIFE_ENT_CINEMA","b":0.13,"s":0.086058,"q":"xiFJxg5ExgRMtQJ/pAI5E0ycBhL7DAqFDRu2VHvyLRebBiJrS8gMEOIGSIQIXMZhDGgQryMQmTUEtkIQ"},{"name":"Rửa xe","id":"MOB_SERV_CARWASH","b":-0.4,"s":0.069098,"q":"4wJYmioOugMjlAN/0gEd2g8tggoixSYRvg5krBsdnwcutTQsvgwskywU0BIU9RMJzFILUQyXNgnKJgyACww="},{"name":"Salon tóc","id":"LIFE_BEAUTY_HAIR","b":1.2,"s":0.11396,"q":"fQt0D+QFBpwEHU0B3RQQqAsD4QQ4vQQXgAL7rAcK3wEd5AQW5AMOgAEghgUdqwHwqgMOfOQo/4wHJfEFAx4mggl/9AYltAgdywoUZQ6iAha7AfrVAQn/BgXJAgnNDQWUAQxhHQ4zpAEA2gYM0wMIfjYtB98EHfUCH5wIBkxVqwgF6gMh0gE1mwH6rgsK7AQuiAQZSwr0BwqMAxj8Aw7pAgrAAQRyCvgTGLgFJewHFbgJGMkFF5UGNpIdIdkMBdITD2AEjA0O9g8jqQIXwwH3iQcZlwwG8BAF5gQXoRwMwgIo/QUStgoJiwUHiggoQBvBBw0="},{"name":"Siêu thị","id":"SHOP_GROC_SUPERMARKET","b":1.05,"s":0.079164,"q":"8QIUREyXAQXUAgiOBAqqAVL8AU0+CaoCEagCHNgBRo4B9lkvoQUlrgHbcyweX10gyAUF+AIKH+FtItoC/+IBEWAS+gNHvgEKFBiJBSPaAQrKAQlHMG0dwAMnrgdWjAV4LzrEAgyeBCgdA9EDFPACFKwBWY4BB8IBHL4CJCEQRz6NBiyIAhKJAgYYGAMpTA73Az2yAT0HBr0CKpsB1psBNFAN2gISigIMtAFIVSPwAgf3AgiNAep1oT7v5QI9xgE3Ky2mAgMe+k1SyAIFKhRafx7x/gHwzgIDrgEbpQNdqQEN6QUkkQLdpAZZ6QEJtAMoGTHOBRyFAvr6AwWAARVbJG0GYzcSEhlEvAIEhQTc/gIEYxT1AR13E8YGFbQBHSMfE9sdFkwtgAFKoAJSVUDlAwZ6JMABPUsGkAFJWi8MHdoDByUd2wM9XU9EFOgBBawCFxkaiAQorgIMFyynAQWEAhT2ARCaARAJNSgkRRPqAxWeARSQBQ3/DQOkBiS1BBeaAXblGAHABiflCQjFCRX2CgWvAyaVDlCLBiO1DwLcBwHJAxLCAhqPAxW7BRC/EgkNMIYDCaoECu8INvIEJvkDGAsEpQsILE3gBBUEH4IUFbIBCugBA/EDA9UCOb0DQaUDDQ=="},{"name":"Spa","id":"LIFE_BEAUTY_SPA","b":0.66,"s":0.10228,"q":"5wPhsgELlwEHkwHj+gMU1AYjvwf+pgLMwgIb4gH+Hid2/7cBAaYGBfEC2CkF1AMElQMg8QEcqAME+QsNJBPJB+8kAU0E7wYJhwEXyQLYhA44KC0tBZEKP9kEOfMHOv4MI8YCC6sEDKgCBdYD3m0ejQcjVRCtAUvzAxj2BOzwCxWYAU/1BOTxAxbrAvbPAhoQAjEb8gExhAUGEhjgATLKCAvxCfiJBH8iBOwCILkDNNgCxQT0MyONAxu/CdjLDAjtLfTSPTH7ATWVIS+6BgrRGg/hFDrBDCv9BRA="},{"name":"Spa thú cưng","id":"LIFE_SERV_GROOMING","b":-0.37,"s":0.064504,"q":"fX/ZJHfSGwL/BkOgB2PNIfu/Dw67DALVGgLVBHvaDQK1CWnCPXuCE0KsVhLiOwjgCik="},{"name":"Sân bay","id":"MOB_INFRA_AIRPORT","b":-0.21,"s":0.085457,"q":"1g5/eB/KJirgDDuDHiTIEAq9BkGACA+qFx/xESuVAT27LzPeBQqEFxaPKjbqjgEo"},{"name":"Sân bóng","id":"LIFE_SPORT_FOOTBALL","b":-0.71,"s":0.075507,"q":"lwVI1gMOwgYGtUMpsgQ5qygh1g8l4gN/qAw4ww1C0gFEjzcqsAEfmoAB9Q=="},{"name":"Sân pickleball","id":"LIFE_SPORT_PICKLEBALL","b":-0.61,"s":0.083196,"q":"vSd8hzYHpFAXu1B/"},{"name":"Sân tennis","id":"LIFE_SPORT_RACKET","b":-0.39,"s":0.064811,"q":"wRs8+h40nQhI0hAb7AM4ywQ2xgkbjhsbshFtkgF/hhRElAcIsxA2ngge9xAC0koF2TEL8wQP9zYIFxXLIyf+CAeHFCfFCiatJBo="},{"name":"Sân thể thao","id":"LIFE_SPORT_GENERAL","b":-0.21,"s":0.097703,"q":"wRv0iQUW3gU0ig4DiQb4txUSbBu9Awn7AjbLBEjXEAPKEAntDVHwAkO0Aj7mAn/mBzPNBhm4CwDSARwjQcAMLMMCCfUCUrcCERUWRRn5ExknBJ4ODJkQILkHUcRPBdkZTA=="},{"name":"Sân vận động","id":"LIFE_SPORT_STADIUM","b":-0.49,"s":0.073138,"q":"lwUcrDcDkhBHwQotgSQK4hdsqAwSlQ8FlRtenQ1e9xN/"},{"name":"Sửa chữa ô tô","id":"MOB_SERV_AUTOREPAIR","b":0.4,"s":0.080857,"q":"uQRGvwFQ3gFnoQEp2QIqyBRDyRcsHlWCAgxCIbUDCnJB6Ak21wQVzwFWmhEHRgryBzDzBkqGAhuxAhbpCk0yBp0FC6IDA6MCG00e/wEKyAIWwQwZJS+yDkJzWokCAR5g1QNHuwgK6QgQ9wUdfC7zBISpASboAWasBV6+Aiu0CSGOBxWZCBmhBg/dBAGlGQiKLVj2FBWXFBv4EinZBRu6CAaBEwGmDwHKEhWBCH/vARXWKgNaEQ=="},{"name":"Sửa khóa","id":"LIFE_SERV_LOCKSMITH","b":-0.49,"s":0.04961,"q":"6g4ZtwcWsRRv9RZ/gwxlogExwjpRwgUfpClA9ypQdhOOCCDcCFCIAnKYAQ++Aw3GHEvqNwOiJQPZHSjrDQOFNCs="},{"name":"Sửa xe máy","id":"MOB_SERV_MOTOREPAIR","b":-0.3,"s":0.10849,"q":"4wIq8gF/lgwc/wRBzQMWgh8H7zAz6B8c9QQKax2DASf2HQLwFBPvFBaVDvKoGQ7IFBPQEhOvUxbjEw14B84oB4ccF/sUBQ=="},{"name":"Sửa điện gia dụng","id":"LIFE_SERV_APPLIANCE","b":0.06,"s":0.066946,"q":"zwgK+gMrwAgU0gMRkAgcmgEcxAQr9QYcsBQcqBcvmQNftwUm1QULswQTyAl/nQ8UeUW6FQSBEy+7Fy+iARTBAXHCKW5VL9UHL8cCE4MSFMYSBuxYDOsJD84eBLMfP70kBA=="},{"name":"Sửa điện thoại","id":"LIFE_SERV_DEVICE","b":-0.03,"s":0.089108,"q":"rQIHgAM18wJ/sAsWxwkN6xBloAQe3Qc+mwki5gYj/gIYigErkwYuwggisgI6rAQDjQEUrA9UjAUQgAktngEM1QwY0w8F+xEGshIKa2GmAQa9CPrQDD7UCyCfCxHQJQCkDgLlQASZExPsDxPIAgX8DQSwCwT6CQaWESnMBQiDGy7zAwY="},{"name":"Thuê xe máy","id":"MOB_SERV_MOTORENTAL","b":-0.62,"s":0.046716,"q":"gDQKqDVC2hdrkSd/hgUF7Rpo7Bdk"},{"name":"Thuê ô tô","id":"MOB_SERV_CARRENTAL","b":-0.6,"s":0.04385,"q":"9wgnyQNN+nBZ9QkVFDW2DVm/Dzz4HQPwGX+4rAEDkAkY"},{"name":"Thú y","id":"LIFE_SERV_VET","b":-0.61,"s":0.057446,"q":"fWPyAXW8VhHpF3+WDWarBCnNbH+BBhWdBik="},{"name":"Thư viện","id":"ESS_EDU_LIBRARY","b":-0.68,"s":0.089173,"q":"x08MwB5/+w4UxhNF"},{"name":"Thẩm mỹ viện","id":"LIFE_BEAUTY_SALON","b":0.5,"s":0.070202,"q":"6gIO2QRFygdgxAM4iQQs7QEoiRMzLDtGNt4ZMq4BRb8ELrALOpMJf6sJEPwYMGY00QUpmgcVuQI9ywYbkAc1ggNR9AMJsgc+eHXvAR3GA1kdBvQFQcAFKpwBKO4QSYYFRuYEQuIHTJ8JewQt9ggRQAazAwC1AT2kDBCNEzztAxjLBUHcBhiaJwSZCxDjAhmrDC7lBR37AR3/BxiWGRz3Fy7WBBCGFA6ZBSGwBAvTBAi+AxjFBRmGFwLqAhk="},{"name":"Thời trang","id":"SHOP_FASH_CLOTHING","b":1.55,"s":0.067133,"q":"EBNZSEQRRz7BARSkBfm+BxvRAmDFATaDByrgASfNBFH5AwScAQ3QBSbjAQ3PAQ2aARCHAV3bAj0zSbEFLKADM9kBYLADDIoCQJUDJPQCftwF//IFJXogoAInFxTdASbKAjeVAvbyAUTeAxSFBkPlAwHFATXAAzcONIQDJ9wFD4UDJ9gBDbgBJfUBL+UCRs8C8c4BRJ0FNSoRmQJZiQYuRD5ZU9oBYpQBRi0eNlSyAjAhClcNWTHfAjrnBlS1AUnOAR1lAKUEONADTNkDBYsCNq0CLVxQWTzKB1c3KIAFAeQBVYwFD78BMgk/igUG8ANB1QcV6QRmCRc1RkcSFmeZAjyNAi5wDecGW3AfKFa9ATEkPz1CBzbvAUVMFqsDHt8FIbMEDKkEBJ8ICaQPKA8OQDHRAwCQD1TgCzeNDRfeCAtmA7QBIPALaXAqSQ3NBAbIBQmtATC9Ai8GBqoFHqIBErYE79oFWt0C/pUEQu8DCFlVdCxU+uUELWMfyQEr2AQ3QR30AwgMAsABf6QBNXLtgQUgmwgjBDKqDuz1BD8HN7gED5oFFesFQk4dkQMqmwMYnAMokQRKjwYH1wwG"},{"name":"Thủy cung","id":"TOUR_ATTRACT_AQUARIUM","b":-0.63,"s":0.031107,"q":"qwN/9QM50xNgrT1XxClblA5/r2Fa"},{"name":"Tiêm chủng","id":"ESS_HEALTH_VACCINE","b":-0.55,"s":0.11342,"q":"zSw0+D0iF/2BJwHfGBefEBCXI3+jIB4="},{"name":"Tiệm bánh","id":"FNB_CAFE_BAKERY","b":1.04,"s":0.090814,"q":"3wYeOwPTAQROO8oDCpoBC9kBc9IC+qYBO4oCehA6mwEhzwEu7gEHbxeqAS7nAgCYARTPBfCGBmNHItsBHcgF7/8FBtECMEUrJwDKAgOzAhSrAwHiAQDcCgC0Bw8IHdgILpkBRycNRyvRAz3pAfroCgECAbcCMpoBB1Q8ywEnFjTRBxOPBPyBAR2QAQQFHUMCnAQh8QFmpAJNrgQfKhfLAk2nAj0nFvUB8iMXxgH7ugc8igUXRxW/AUaXBPycAmP7AzPmAQGUCR2RASEvSRkAVf9oHP4JAzn70gMsxgH8uwMOgQEFmAIUWhziARXXAXulARj9AjNsE+gBOmjZ0QL5iQIQ0wH6fwfjAQvXBgTtAwDNARekBBKyAwGHBisCTpsKNaUCIMUFEtIFA1QQhh4rZAhmf70PDb8KGd0FAY8DDYYLCfQPDRQP4gYHugQNuQcRjAYAuwEY8gtA6A0HgQENkQ0olQYphAcPoQMD3QENuw1SH/zIARK8GAY="},{"name":"Tiệm hoa","id":"SHOP_HOME_FLORIST","b":-0.34,"s":0.083465,"q":"7xl//wYSol5a2xIYxBA0nQUsxgc06BQlvxstBxa6Cxy7Cy3gBxDdLBrFCirwQyY="},{"name":"Tiệm may","id":"LIFE_SERV_TAILOR","b":-0.48,"s":0.057996,"q":"6BI0iwoAggNjjVV/xhJigws3zwlikgUy+Ast4VEM"},{"name":"Tiệm nail","id":"LIFE_BEAUTY_NAIL","b":0.18,"s":0.058867,"q":"0BkupgJ9mg4NpwZ/qx9lygdo1B1WwQEL6wEh2wO+gh1f0wdujBNCzQHWmAHIxCMhwAZyrAwhyw0YqgXbogNvthJDkwNH/QRx8QkPozlY7AoKpwEPuhsPtQFv7kFLAm8="},{"name":"Toà nhà hỗn hợp","id":"PROP_COMM_MIXED","b":0.22,"s":0.089611,"q":"sgkW+wEMzAsowglLfn+ACgf4CBGkCRbpAyjsDRClECixA0KLDUzFCAVoHcgBGwUq8AMEpQEt6wQJpg8fowsv/gRH9gwgggkDwAFBmQcCwAQD2wkoqQQi9wI88ghTpwgfvgsoigEH7AZihQUOyy9FsRQHhBEGjTdRwxH8oBcTmxsJjQ8C"},{"name":"Toà nhà văn phòng","id":"PROP_COMM_OFFICE","b":0.78,"s":0.086407,"q":"8QEA2wI7yAYGsgMzqAMe6gMtzwM0tQQSZQr4An9WLnc4+AEO1gMaAzVYAaECJboDO6UCGpYGQVkRuQETsgMJRQ7VAQnNAwuUASaSAhe4ASeGAx2WATczZ9wEA+QBEQRgCg7nBx7pCCCkAgn6AhQ/VAEMcRfwATxfM7MJCpcBGlQn0gERngEJaxHyBAr6AxhmDW0QjgETID3OAhohA4gBb9MCA/sCbQz8Fz27AhXAAQBOIIABM0sT8gEFIycNK6YGD9IBDogFG+wDJ8QCVgwdHBkBKcADG3UegAE7mAMJxAFEvQQJswITdECRBBxYBfYCBJUDLnsFCQrMAUH6Age+AyJZHm1N5gEp4QE4uQMRuwMB7ggAywEGmwQWTAPvASPUBf+yBRQMBwMN1wIPlgEOORW4AvqyBwWeCzDIAQaDCA7qBg+cCg2uBDmeAQqLAQm3CAZOOeMECYgSGcMDDesFBNUKWe4BEo8FBj8H1gME0A8QEkf1BhCzAVaWAQrRBiavCCKWASeCARgbCYcRAIcGGaIEOIYEMtgCD9YDBqsFK4kFG6ICGMELFIQFCYsCFs0DCckV5Q=="},{"name":"Trang sức","id":"SHOP_FASH_JEWELRY","b":1.0,"s":0.095462,"q":"1Qk3tgYulAMWvwEblggX6gMx5gIF7wI2nAoyrgIGgQ4LZjCnBB7wDSfjAmn8AgnxBjhdSc4BQ9QFFvsFIZ4ILO4BNpsDMM4BCpgBDusLGYQBLFIChgN/iQUjxgEMIAkRIqUBUhxOZDKHBBHQCFvkBw+8ASi0BCWOAiOaDDTHAhXKATCIAy2zCBXVECe7BDTsCEBWGNoCG/MIPpMSCr8CBNkECqgXA+IBCoALHYgJAt8DJroFF40sFqgCBeUBAuMMLMEFJtkXJM0FJcMVBOMfJZQJALIJFx0lGQjMChY="},{"name":"Trung tâm game","id":"LIFE_ENT_GAMING","b":-0.11,"s":0.09644,"q":"+QJ//gUZiwI3qwEr2SYrzxg4ywwn0gI53QMxnytZywgiwAI0/wkIsiMUBgiTFA4="},{"name":"Trung tâm hành chính công","id":"ESS_GOV_PSC","b":-0.27,"s":0.040052,"q":"6gQcwwVwggUKziMF9RJ/pQh8ng1P/QFw8AQ1gQpJtw1VhxZOzgdJmwEFiAE2vSxawQhJ5gR8vwdJ7wxM"},{"name":"Trung tâm ngoại ngữ","id":"ESS_EDU_LANGUAGE","b":0.33,"s":0.079342,"q":"rANq/go2ZTv3CRfiFAWCAze3CEXLDgrIAlOBHSdrC5sDLa0OLpoBGagDAOoEH4YEJMYPa21PhAE0zwEylgIcjxEBiQhp+Ac2pQoKmAV/+QcqTTYYAZkMI/kICbsDCsgJIrIUFZMGEqwEFYcUBPIZFbMDP5EkTrACEbAHEYkECkIAzwkxkAIV7Ag7zAUU4wsVjwUw9g4M8w4F8RQe0AwekgEVRBXfCQSqBwKTAwykAhUECQ=="},{"name":"Trung tâm sự kiện","id":"TOUR_CULTURE_EVENT","b":-0.46,"s":0.074944,"q":"uwRF9Qop6yBFnwwF7gQtwAMYuwwt7A0FmCo7zBEh3wwG8hJ/yA4+lggh"},{"name":"Trung tâm thương mại","id":"PROP_COMM_MALL","b":0.28,"s":0.074803,"q":"sglGvgVu6Qo0zwE/8gQO7wVFrAsK/AIeHTeGBhLPBDvcCB7wBSXoAhkLR/8FLfkCHr4EQccHFSdCRkDKFj4kFsUKC5IBI0xJ5AEcnAQLywlO3gEC3gJvCnPDAiSoBAb1BAvDCTynA07LBWO/ATqdAWf+ESX1DX/NAwawBjLTBg9GFKECLdMCPK8BJoIIGuMLGtYbGrslJ5EaAukLDbgpDY8EJqwDDDoMwxARsAkfHzOUFRKkGTBQGvkGHQ=="},{"name":"Trung tâm văn hóa","id":"TOUR_CULTURE_CENTER","b":-0.72,"s":0.10062,"q":"oQcs7wEGnQwQ42kXoQgE/Bd/qgYSgH4Vtq4BDpQSATwO"},{"name":"Trung tâm đào tạo","id":"ESS_EDU_TRAINING","b":0.75,"s":0.084293,"q":"0gkBUTa/B0XSAkKTBjKVAwK2AiG6BWqJBVbMDiyOAQ6vBwOWARD4AhjiAQfLBDmKAh9JBrcECLECf9AIFq0COOQGK6oHEeEBMlMghwIoqAFZwgMb0AEzowIaWjojIg4hkwEqAxQSAihpIyklB0wYrgMmmgUKlgkDDS6NHEILIKIGGa0HGaoHH/8DHNIJEZYFAfQFKmMHtAQrJkj7BTfqAyScAiAFBpMDJ8gIJi4u7gcHnwMS4hQMzkwJshcM7xYSmRIzmgwRLBHXEhLDBQeQBCaEAgDNCAzGBQjIEBE="},{"name":"Trà sữa","id":"FNB_CAFE_MILKTEA","b":1.11,"s":0.09612,"q":"0AHuiQYUlAEbUS11KjUCzgMOygcVQDzxAgTGBDClAyXkAv9HAM8IMAkdiQElzQQnGle1ChzNBFMQyt0KHqUBE88BDHoH7ggrwgggrgQngAIIBzEQKTgZtAYviAFNbFrcAQ0RFAcrvgQUlQIR+gL/hgI4chf9AhEnDhYYnwEDywEA7AYNnAL1SR4EAYICJfUDLx4i4gIGkgRAPQzsAyyfAilKPS7ziQXKQH/FBEDsBy+kBhK0Ag3wAi66Cfi/C/itBBuNBPCBAhu/AiM3CVci8wP4lgElngMiSh6eBR5UFYMCIkAnzAIztgFQzgT4qQI4mg0Rqg8B3wYEkhsMogISCxSQCg7CAx6mA/1mCd0ILNMCFIQGCp8BBJEBE/QFPPYKJrkLFdkDPKwGF/MGEPQDKIUB+8YEAqwIEYYQ/KkID58CPbsE+/cCNZYDCtkBH+AJF4sFSpEBBIcGOiUPgwE5xRMPtAM1lwMN"},{"name":"Trường học","id":"ESS_EDU_SCHOOL","b":0.28,"s":0.11445,"q":"zwQhOQSyAzBWBLkDCuEBDoMHFfQDz/EGByka7QUSThPhAQXhDRJTBekLJfgOIs8FDeMFEN8JDjgVuQQepgUErgMKyQE/WAY6F8UCJfAE3iP3nwQQ7wESERQiVggGhQQW1AUCrgYWmgURxQEilQEGhAMQwwIG0AEJCQyQARS9Ah3iClutAkbTAT/ZASWPBBVvJcQBCscFCeYBf9gONzkFjAoiFwKbAQPkAQkSEugBFfYFC/oMJpwBOuoKCakLDv4GDaUICssGDa0NF84NC9UFDOYXMOIBFc0EB5gZM48nAugFDM4FD9sHHtUDHvEFDP8OAf4LC7AHDMwBAp8JBakHDYcEBYAFCw=="},{"name":"Trường nghề","id":"ESS_EDU_VOCATIONAL","b":-0.58,"s":0.048615,"q":"9QNlp0d+kzwWFDP1HDqiMn/gAgHaB1A="},{"name":"Trạm dừng nghỉ","id":"MOB_INFRA_REST","b":-0.67,"s":0.05833,"q":"9QgI5x0JxEEmolV/pCF2j4cBBw=="},{"name":"Trạm sạc ô tô","id":"MOB_INFRA_EVCAR","b":0.21,"s":0.15286,"q":"9QgIqgp/xg8RxAMLpQ4yugwK0gUD1wURkQQgIA9lILspKKkCL+ICO+0DN54kIKoRI/wHFoMNDvcWA4YLFNwOC9kDAbQlAfUYAbkmDfYFBIFsAQ=="},{"name":"Trạm xe buýt","id":"MOB_INFRA_BUSSTOP","b":0.28,"s":0.083833,"q":"5gFAfSoiN+EELY8BJ9sCPdMITPkMA/8HOfoHOZEOQdYKA8gTHN4EK60MJJkDWcAIFrMOONMBDNcEIbcVBocCTcwGItILCL8Yf8gQHokCCscBG9YCKOMGA5EDFOsFDckCBZMBE3U5gAMu9hUOjw0B0yIE5ggZphQughcKkhYViQI9QyjtCj3iAgb1AgnwQwk="},{"name":"Trạm y tế","id":"ESS_HEALTH_COMMUNITY","b":0.1,"s":0.08179,"q":"3gYAQxS+BB/nAjyHBhmBCkSbGh7iBgjcCC6+BQXKDlOtDjf6AmWCDxzFCy3CAg79Ax/TBmSjBBHHAgCIDH+FCR7uBjbHAlmEBBMsBZ8TIKUGFKILEscBEOgJH+AfCu0PF8EBEokMF+AkEqABEpYMEuUJF6cSBuEZBaQDDugXEPYFAwQDhgUj8yQb"},{"name":"Trạm đổi pin","id":"MOB_INFRA_EVSWAP","b":-0.68,"s":0.054134,"q":"9QgF9Qh1yTw/3FN/rQIX"},{"name":"Tài chính khác","id":"ESS_FIN_OTHER","b":-0.18,"s":0.045529,"q":"+BNqyAQ5swVvrgRplA8CmiNQqgdtlgMloQpiziVbwgYe4ghbhA1/pSFriht/lZcBDZAqDb0NCw=="},{"name":"Tòa án","id":"ESS_GOV_COURT","b":-0.64,"s":0.074332,"q":"wBhNgCAqhxcLvkd//yQApwMJ6yhJvmwG0FkB"},{"name":"Tượng đài","id":"TOUR_CULTURE_MONUMENT","b":-0.24,"s":0.073738,"q":"pQoDhEMp+AIwxgcozgQw7wEblARAiw8l1w0HrQV/3ysIihAhwgUoogo8tA8BnQcElwkOvwIG+wheiE8D8YYBNa8TBA=="},{"name":"Tạp hóa","id":"SHOP_GROC_GROCERY","b":1.0,"s":0.074566,"q":"3gYhkAE/sgIVKSyuAfNHPAsg/QEM2AZlrwEG+AUqxQQU/wQz3QEzOhjcA1pRyZUDBZwBM5YDEdMBJcoBXUfzrQFi0gEYuQFNxQH+kwMx8gILH7Ik0ZEDCC9lZgLCA0/HBBcYPVl08gIaThtGRP4CFcgBMoICMP0EMLgFC+oB2MoIU6kDBaYCafUDDMYICKABFTB/kwZaWgiuAj5/Gx4K+wMXPF5XQacBVU8hqQEBVhvSA8W4ByYxdJ4FBZMCN7YJCEoWdELYAi33AlXcAVhLFeMFCesCcN8HIQon2wEUwAE71gEghwZRbFSoBB/eAU1aS5IBVasEU4wFC+UDI90BOH0S4QEz0QUSiQFjUW4yFSMMC/5TM1wG6AHZggwcmgMAyxM03AEdLiGkAem9Eg+dAhrBAhL/AieMAgitCBCyJAa3AgmOCyqIAiq7CRjFAheEBgWoATEsKswBDp4EDeQC4KsC/8UCPLsFEoILGhkFggHvqwgM/gERlgEJzQRBhwQGXfTOBFvNASp7CpQELv0DAFM0MAifAUr2BTRqPbABP9sNEJQCPNYHDJgBAfcDBJgBAw=="},{"name":"Viện dưỡng lão","id":"ESS_HEALTH_NURSING","b":-0.59,"s":0.077286,"q":"vBEHozpo6UoUtFJ/jDMioMoBBw=="},{"name":"Viện kiểm sát","id":"ESS_GOV_PROSECUTION","b":-0.57,"s":0.06174,"q":"2Dc31wJ/mwNK2CQkhgM10AhT7w4QjgIG4ykkiUExuxwKyEUG"},{"name":"Viện nghiên cứu","id":"ESS_EDU_RESEARCH","b":-0.15,"s":0.079188,"q":"1Sr40h0I9gMTtwk6sgpH6gkn5gMnrgoE0AELlxEo2QZJ7xEB2BB/iwcC8QM2JAndAyfjDB2UAROPASWZDCXTAv2TAwroAkP0DUCPJAnOTAayFwn7GwztMQXhDgmWAQw="},{"name":"Võ thuật","id":"LIFE_SPORT_MARTIAL","b":-0.69,"s":0.067393,"q":"0EUAxmZ//BY55RMIxBtA"},{"name":"Vũ trường","id":"LIFE_ENT_NIGHTCLUB","b":-0.56,"s":0.042024,"q":"vQtu1gJBiRMXgRRgrStk8z8s0hR/8gwagTAVpgZD"},{"name":"Vật liệu xây dựng","id":"SHOP_HOME_MATERIALS","b":0.4,"s":0.086543,"q":"8wQRzQIFngMZ4g0KjQgcPCL1AxzWAzrPAh/7DDDHBSb1CDeRDByUEBTtBFC+Bh+oCBSoCScyHcILJr8ND84CRKcCGIoDG+8BI8cII6EKI80BedwCFdUIGqECMeMDB7wFK+4HJvcBOpQBBI8GHQEKuAIdyghBWSD+CQ2KASuTBSCiASO4AiDRMAm8D3/nRQbjMTWlDAo="},{"name":"Xét nghiệm","id":"ESS_HEALTH_LAB","b":-0.43,"s":0.13364,"q":"0QsKDiD9BA2mBSbOLzL+AQLVBheEGyj2CRfVAi/yCBidBH/eBxX9AyApFOMGDr4aCZwcG9QGDfYOCc8CDsUKILwFA0Mk5ZYBE4UCFw=="},{"name":"Yoga","id":"LIFE_SPORT_YOGA","b":-0.18,"s":0.13685,"q":"zioPxg0A3Ap/2h0C2gpQuDIAjwsFxRcniAsMvwsHZAgIE84HN8NkBKEvH4wLBMgCH68YH6gMAa8KH+4NBMcHHIkNBLMeBJkBHg=="},{"name":"Điểm tham quan","id":"TOUR_ATTRACT_SITE","b":0.14,"s":0.061425,"q":"xgxK8AFalQpojRU4pQUMVSjdEUpyNixH1ARlzwFbrwR12wlHxB0r2gUC9Ad/uAIc8gYdqglVxAtx9iYz4gZK1wcd0wwJPxefCzCaBB0bB/seEMg4Fs2pAQZRTQ=="},{"name":"Điểm thông tin du lịch","id":"TOUR_SERV_INFO","b":-0.66,"s":0.044754,"q":"n1tQ1R1L1x0Ckw1voQ5/wB01"},{"name":"Điện máy","id":"SHOP_TECH_ELECTRONICS","b":0.4,"s":0.08346,"q":"kQIxHA6IAT3VAiukCMJkB/cFDzNBngI2gg/7uQkz2g0u1gcm5AMe7xQT/QFdLyKHASv/Bin6BCe5AjX5Az+KBRaCAgOWA/ZfE94DDPcCNE0M9wpRBCVjMWY1nQEIlwJ/jhAFFHn/ARuoFDmDAQeZATabAj7UEwjICRTiAhKzCTHxCS6NByPFA0H3EBbtAw6mAhHIHSmZFS68I0XMFxbOHgbzFw6cBQGWDw7IBAODEwaMEQo="},{"name":"Điện thoại","id":"SHOP_TECH_MOBILE","b":0.71,"s":0.10877,"q":"tQMvfhzYCxuZGyjEBiyjBUr0Ak+WAQ+FCPlqDcwBAbAE+fkGNLoEIKoH+bsB0qwCGYcBQbYJFNMOBJYFB+IGBPMBEd8BDNQBIfABBKMBAroFCKECBe4JB/UDIcIFMc0KH78CHIELHewBIeABf7MCH7AHMS5HzwYIhQIEzgNPvAET4AEvmQMJhgkcmAJfzhEc3RAF9A4Q/QsE/gYl2QIBzQMdnCgKnQcBiQcKxB4CvAIc9gMfwQUaiQIBgQsZLwEDF9cEA6AFB8IBIIIDBMELHLkIIYQIBccEIGsCsAwKtAMD"},{"name":"Đình","id":"LIFE_RELIGION_COMMUNAL","b":-0.7,"s":0.038438,"q":"tTF/ryFfyUxO5ApT0Cl8/6ECWPADWA=="},{"name":"Đăng kiểm","id":"MOB_SERV_INSPECTION","b":-0.7,"s":0.066397,"q":"gDQioi49kwUV8xJ/7AgTrbsBENRWEA=="},{"name":"Đại học","id":"ESS_EDU_UNIVERSITY","b":0.19,"s":0.18103,"q":"lQwH0QESkQgCqgN/5QElqQEDpx4B7QEDkg0fJxMZG4gCB8YMEMUKAIsGB4UDE7gCQuABBIoHGCoC4AkO0AMQAijvFBbGAQGTBBbHCQgNAHwHoAIClg8SxQYQhwQJmwIA/wMHlQQG9hUKoAUViAIHNhHyAwSLBAS5AhaUCgH/CwK0AQGmBRckAt4CA+oEF/gnE+wfArIXA4YtE94fAIQBAikPuA4DqQISxBkC"},{"name":"Đại lý du lịch","id":"TOUR_SERV_AGENCY","b":-0.21,"s":0.069472,"q":"wwdPjAEY5iwCgAx/5AIg8lgqqAYirhUgtgJoOU/aBiaOCRqRFGv0GkKqtQEM0BIpvxZA"},{"name":"Đại lý vé","id":"TOUR_SERV_TICKET","b":-0.67,"s":0.031405,"q":"/AVswlJtvmF/mApMgxV7mx1a"},{"name":"Đại lý xe máy","id":"MOB_SERV_MOTODEALER","b":-0.65,"s":0.060676,"q":"0BkA1BFT+gR/ijlH2QEyhCMRgHEN"},{"name":"Đại lý ô tô","id":"MOB_SERV_AUTODEALER","b":0.2,"s":0.081057,"q":"rAQ8qgMV+wcG/AQ1sgNDnQxO5h4OsQs7pRIphwUS9gojoAYtKE7jBxPkLRHJAVT5AjmhCCnEBSYsNKcCYscFDf4Bf8krEtEFEZ0NS74CHZVEBKIIQ6RzATAvwCEByQQd"},{"name":"Đại sứ quán","id":"ESS_GOV_EMBASSY","b":-0.62,"s":0.081031,"q":"wDgqpgR/+3sr5kNtjVgB"},{"name":"Đền","id":"LIFE_RELIGION_TEMPLE","b":-0.21,"s":0.10051,"q":"rAN/5AUMnQwX4gYQ9wYhqwMzhzwt8AIlmwwYsgUq8gUNjgIG0gUNyQwG2RcHsAQIjQMG7SFPiQY+rAcgtBALvwIG7RwB8QYC"},{"name":"Đồ thể thao","id":"SHOP_HOME_SPORTS","b":-0.14,"s":0.062126,"q":"+As7sQUytTAP6wYyyD0vgQ4ZnQsCoB08mhMi2Assmgs73QYCpwR/1wVInG8wpwUX6DcuAi7xES/JElyIKgPeAi4="},{"name":"Đồ ăn nhanh","id":"FNB_EAT_FASTFOOD","b":1.2,"s":0.12041,"q":"6gINIzmNBAaPAy0FEHsk0gEmpAEnuAEGWh/2ATGiAUKyARLWA0GLBRzcAjSsAULQARa1ATj3BiTVBRAIEusBOFgxYDHdAlnlAyWdBQblBCuCBxhY7VQFmgEMgAIETy6QAhH0BQ0bJNsGJJIILbQBDTU01QUFPQ3UAR2jAQxrCE839gNIHCGFAVOLBD35AwpfD/kBKcsCAcACBMcD+ZMBCGZprgMMwQMmlwEAlQkaWRcQBLICCcMCIbcIAS0RmwIgkQEKuQEIUgKMBPiTAQCoAwlfNuYBMIkIFdkFB2MdyQIGxQUHDAq7AUP7BwexATSBAwcQI1cv7gUO8wkUKCXcAUEKP0UOvgEb9QEjgQEdAgyNAUNnJ4wCf9ACAzALvw8GOg2nBwrCCQubAgyTAwvDBALYAQSNEwpj/hgLnxoilAEFkw8LqgoE4RfkpAIE1AEplQkL+QoknwYArRQCmAkupwwD3wYLmQUQtgb+iQkpAg0="}]},"prefix_cat":{"nha hang":"Nhà hàng","nha thuoc":"Nhà thuốc","com dao":"Cơ quan khác","katinat":"Quán cà phê","katinat le":"Quán cà phê","truong tieu":"Trường học","mixue":"Trà sữa","diamond":"Khách sạn","diamond hotel":"Khách sạn","raaw":"Quán cà phê","raaw coffee":"Quán cà phê","techcombank":"Ngân hàng","guta":"Quán cà phê","guta cafe":"Quán cà phê","am thuc":"Nhà hàng","nha tao":"Nhà hàng","chung":"Chung cư","chung cu":"Chung cư","hoc vien":"Đại học","pho ban":"Nhà hàng","nha khoa":"Phòng khám","koi the":"Trà sữa","dream":"Pub","dream pub":"Pub","karaoke":"Karaoke","karaoke london":"Karaoke","vua bo":"Nhà hàng","phe la":"Quán cà phê","paulin":"Tiệm nail","paulin cafe":"Tiệm nail","pao cafe":"Quán cà phê","ca canh":"Bách hóa tổng hợp","com van":"Nhà hàng","cong ca":"Quán cà phê","hang":"Nhà hàng","truong thpt":"Trường học","handico":"Toà nhà văn phòng","handico tower":"Toà nhà văn phòng","foremost":"Tiệm bánh","pizza hut":"Đồ ăn nhanh","grace":"Spa","grace hotel":"Spa","benh":"Bệnh viện","benh vien":"Bệnh viện","dai tuong":"Tượng đài","cafe":"Quán cà phê","nha tro":"Khu tập thể","ok mokchang":"Nhà hàng","kichi":"Nhà hàng","kichi kichi":"Nhà hàng","khach":"Khách sạn","khach san":"Khách sạn","an phuoc":"Cửa hàng thời trang","signature":"Chung cư","chi cuc":"Hải quan","bao tang":"Bảo tàng","highlands":"Quán cà phê","highlands coffee":"Quán cà phê","vpbank":"Ngân hàng","kingfoodmart a7":"Siêu thị","quay":"Nhà thuốc","quay thuoc":"Nhà thuốc","tram sac":"Trạm sạc ô tô","tao pho":"Quán ăn","v man":"Thời trang","bhd star":"Rạp chiếu phim","be boi":"Bể bơi","dien may":"Điện máy","pizza 4p":"Nhà hàng","phong kham":"Phòng khám","mcdonald":"Đồ ăn nhanh","mcdonald s":"Đồ ăn nhanh","masteri":"Chung cư","masteri west":"Chung cư","pho cuon":"Quán ăn","the coffee":"Quán cà phê","toa t11":"Chung cư","gs25":"Cửa hàng tiện lợi","thuc":"Tạp hóa","thuc pham":"Tạp hóa","fast":"Quán cà phê","shinhan":"Ngân hàng","shinhan bank":"Ngân hàng","winmart nguyen":"Siêu thị","nuoc":"Quán vỉa hè","nuoc mia":"Quán vỉa hè","tihy":"Thẩm mỹ viện","tihy piercing":"Thẩm mỹ viện","truong thcs":"Trường học","isushi":"Nhà hàng","isushi aeon":"Nhà hàng","truong dai":"Đại học","ca phe":"Quán cà phê","yakimono":"Nhà hàng","giat":"Giặt là","giat say":"Giặt là","ngan hang":"Ngân hàng","long wang":"Nhà hàng","nang":"Quán cà phê","com ga":"Quán ăn","tiem banh":"Tiệm bánh","ministop":"Cửa hàng tiện lợi","bia thang":"Quán nhậu","nem nuong":"Quán ăn","salon":"Salon tóc","pharmacity":"Nhà thuốc","pharmacity park":"Nhà thuốc","vietcombank":"Ngân hàng","vietcombank pgd":"Ngân hàng","ngoam":"Nhà hàng","tiem chung":"Tiêm chủng","nha sach":"Nhà sách","atm techcombank":"Cây ATM","suon":"Nhà hàng","suon muoi":"Nhà hàng","chao":"Quán ăn","tpbank":"Ngân hàng","flora":"Chung cư","flora panorama":"Chung cư","tram xang":"Cây xăng","kinh":"Kính mắt","kinh mat":"Kính mắt","toa t6":"Chung cư","che sai":"Quán chè","banh dau":"Tiệm bánh","maison sen":"Nhà hàng","rosita":"Salon tóc","rosita est":"Salon tóc","crocs":"Giày dép","viettel":"Điện thoại","viettel store":"Điện thoại","park":"Chung cư","park 6":"Chung cư","familymart":"Cửa hàng tiện lợi","familymart landmark":"Cửa hàng tiện lợi","giat kho":"Giặt là","atm vietinbank":"Cây ATM","hai san":"Nhà hàng","circle":"Cửa hàng tiện lợi","circle k":"Cửa hàng tiện lợi","petrolimex":"Cây xăng","hy cafe":"Quán cà phê","winmart plus":"Cửa hàng tiện lợi","toa elite":"Chung cư","tram y":"Trạm y tế","long bo":"Nhà hàng","thai express":"Nhà hàng","nha hieu":"Đại học","yen sao":"Tạp hóa","lado":"Quán cà phê","lado cafe":"Quán cà phê","lau nuong":"Nhà hàng","autobank":"Ngân hàng","autobank bidv":"Ngân hàng","park 7":"Chung cư","the cake":"Tiệm bánh","toa prestige":"Chung cư","cuu van":"Nhà hàng","cham":"Quán cà phê","starbucks":"Quán cà phê","starbucks landmark":"Quán cà phê","thuoc":"Nhà thuốc","thuoc y":"Nhà thuốc","pho cao":"Nhà hàng","lo ko":"Quán cà phê","chao long":"Quán ăn","vien kiem":"Viện kiểm sát","phong tap":"Phòng gym","freddy":"Spa","freddy salon":"Spa","photo":"In ấn","3 hao":"Tạp hóa","vietinbank":"Ngân hàng","vietinbank chi":"Ngân hàng","banh anh":"Tiệm bánh","pame":"Quán cà phê","pame coffee":"Quán cà phê","dien thoai":"Điện thoại","quan com":"Nhà hàng","aha coffee":"Quán cà phê","dai su":"Đại sứ quán","gs25 me":"Cửa hàng tiện lợi","vinhome":"Toà nhà hỗn hợp","vinhome sky":"Toà nhà hỗn hợp","thien":"Nhà hàng","thien ke":"Nhà hàng","trung nguyen":"Quán cà phê","maison nha":"Khách sạn","lk 17":"Khu đô thị","zody":"Căn hộ dịch vụ","zody house":"Căn hộ dịch vụ","toa t10":"Chung cư","cay xang":"Cây xăng","juli":"Spa","juli beauty":"Spa","cho com":"Chợ","lotteria an":"Đồ ăn nhanh","matcha":"Quán cà phê","matcha hitotsu":"Quán cà phê","vincom ice":"Khu vui chơi trẻ em","the jade":"Trang sức","herrin":"Spa","herrin spa":"Spa","tiem ca":"Quán cà phê","pho lanh":"Nhà hàng","ha dang":"Siêu thị","quan ca":"Quán cà phê","tra da":"Quán vỉa hè","vang":"Trang sức","vang bac":"Trang sức","vinhomes smart":"Chung cư","goc ech":"Nhà hàng","buffet lau":"Nhà hàng","long lon":"Nhà hàng","goc da":"Nhà hàng","hair":"Salon tóc","hair salon":"Salon tóc","showroom":"Nội thất","showroom dergo":"Nội thất","a25 hotel":"Khách sạn","cafe banh":"Tiệm bánh","banh da":"Nhà hàng","cafe de":"Quán cà phê","aeon":"Trung tâm thương mại","aeon mall":"Trung tâm thương mại","hanh":"Nhà hàng","hanh xoi":"Nhà hàng","chi nhanh":"Ngân hàng","since":"Trà sữa","since tea":"Trà sữa","tiem giat":"Giặt là","chao dinh":"Quán ăn","hong tra":"Trà sữa","cong an":"Công an","phuc long":"Quán cà phê","th true":"Cửa hàng tiện lợi","atino":"Thời trang","o douceurs":"Tiệm bánh","acb pgd":"Ngân hàng","tong hop":"Cơ quan khác","ping":"Khách sạn","ping hotel":"Khách sạn","salon toc":"Salon tóc","pao quan":"Nhà hàng","kieng":"Nhà hàng","kieng quan":"Nhà hàng","cafe moc":"Quán cà phê","three":"Spa","three tabom":"Spa","coco ichibanya":"Nhà hàng","quan lau":"Nhà hàng","viettelstore":"Điện thoại","pvcombank":"Ngân hàng","nham":"Quán cà phê","nham coffee":"Quán cà phê","highland":"Quán cà phê","highland coffee":"Quán cà phê","lop mam":"Mầm non","truong mau":"Mầm non","pingu":"Trung tâm ngoại ngữ","pingu s":"Trung tâm ngoại ngữ","every":"Quán cà phê","every half":"Quán cà phê","anh hoa":"Tiệm bánh","bidv":"Ngân hàng","bidv pgd":"Ngân hàng","joma":"Tiệm bánh","joma bakery":"Tiệm bánh","cafe cuc":"Quán cà phê","seoul total":"Nội thất","ga quay":"Quán ăn","vera":"Hostel","vera luxury":"Hostel","kafa":"Quán cà phê","kafa cafe":"Quán cà phê","quan bun":"Nhà hàng","bi a":"Bi-a","grapa":"Quán cà phê","grapa coffee":"Quán cà phê","lau ga":"Nhà hàng","chan":"Nội thất","chan ga":"Nội thất","met long":"Nhà hàng","vinh cafe":"Quán cà phê","nha hat":"Nhà hát","bibo":"Mẹ & Bé","bibo mart":"Mẹ & Bé","cgv vincom":"Rạp chiếu phim","manwah":"Nhà hàng","manwah taiwanese":"Nhà hàng","the little":"Quán ăn","can ho":"Khách sạn","quan cafe":"Quán cà phê","california":"Phòng gym","california fitness":"Phòng gym","thap":"Khu đô thị","thap dong":"Khu đô thị","giat la":"Giặt là","sua tu":"Sửa điện gia dụng","hoolala":"Nhà hàng","quan thit":"Nhà hàng","pho khoi":"Quán ăn","vua cha":"Nhà hàng","hoang khoi":"Điện thoại","tiem hoa":"Tiệm hoa","lotte mart":"Siêu thị","phan":"Chung cư","phan khu":"Chung cư","seocho":"Nhà hàng","seocho kchicken":"Nhà hàng","paris gateaux":"Tiệm bánh","sumo":"Nhà hàng","sumo bbq":"Nhà hàng","rap chieu":"Rạp chiếu phim","jardin":"Salon tóc","jardin de":"Salon tóc","toa t18":"Chung cư","pho 100":"Nhà hàng","ngan pho":"Quán ăn","kimmari":"Nhà hàng","kimmari chicken":"Nhà hàng","massage":"Massage","massage quy":"Massage","king fitness":"Phòng gym","sua xe":"Sửa xe máy","ben xe":"Bến xe","doi dien":"Trạm xe buýt","funny":"Khu vui chơi trẻ em","funny kids":"Khu vui chơi trẻ em","sky dining":"Nhà hàng","blubiz":"Khách sạn","blubiz hotel":"Khách sạn","garage":"Sửa chữa ô tô","tiny":"Quán cà phê","toa s2":"Chung cư","rua xe":"Rửa xe","ctq texas":"Nhà hàng","zen spa":"Spa","phu chu":"Cơ quan nhà nước","aria":"Khách sạn","aria hotel":"Khách sạn","ngan spa":"Spa","halee":"Quán cà phê","ga tuoi":"Nhà hàng","barber":"Cắt tóc nam","lynk":"Đại lý ô tô","lynk co":"Đại lý ô tô","30shine":"Cắt tóc nam","com binh":"Quán ăn","kidsplaza":"Mẹ & Bé","kidsplaza s2":"Mẹ & Bé","thai yen":"Quán cà phê","tokyo cafe":"Quán cà phê","fuji":"Spa","fuji wellness":"Spa","agribank":"Ngân hàng","agribank phong":"Ngân hàng","phong hop":"Đại học","bep 3":"Nhà hàng","bold":"Quán cà phê","bold brew":"Quán cà phê","a choen":"Nhà hàng","cyber":"Trung tâm game","cyber world":"Trung tâm game","beauty":"Mỹ phẩm","beauty box":"Mỹ phẩm","il corda":"Nhà hàng","pho hai":"Nhà hàng","parin":"Tiệm bánh","pvcombank chi":"Ngân hàng","starbucks coffee":"Quán cà phê","anta":"Cửa hàng thời trang","the noble":"Khách sạn","cong sau":"Trường học","halee coffe":"Quán cà phê","gogi":"Nhà hàng","gogi house":"Nhà hàng"}}/*__END__*/;
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
