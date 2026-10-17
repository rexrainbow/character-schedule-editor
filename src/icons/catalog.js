// One activity catalog for every schedule type. Labels and search are local.
const groups = {
  work: [
    ['briefcase','工作','Work'], ['building-skyscraper','辦公室','Office'], ['device-laptop','電腦','Computer'], ['keyboard','打字','Typing'], ['mail','郵件','Email'], ['phone','電話','Phone'], ['video','視訊','Video call'], ['users','會議','Meeting'], ['presentation','簡報','Presentation'], ['clipboard-list','工作清單','Checklist'], ['pencil','寫作','Writing'], ['school','學校','School'], ['book','閱讀','Reading'], ['books','學習','Study'], ['certificate','考試','Exam'], ['calculator','計算','Calculation'], ['microscope','研究','Research'], ['tools','維修','Repair'], ['code','程式設計','Coding'], ['palette','設計','Design'],
  ],
  life: [
    ['home','居家','Home'], ['bed','睡眠','Sleep'], ['armchair','休息','Rest'], ['coffee','咖啡','Coffee'], ['cup','飲水','Drink'], ['tools-kitchen-2','用餐','Meal'], ['chef-hat','料理','Cooking'], ['bowl','早餐','Breakfast'], ['pizza','披薩','Pizza'], ['apple','水果','Fruit'], ['shopping-cart','購物','Shopping'], ['shopping-bag','採買','Groceries'], ['basket','菜籃','Basket'], ['wash-machine','洗衣','Laundry'], ['ironing','熨衣','Ironing'], ['bath','泡澡','Bath'], ['droplets','淋浴','Shower'], ['vacuum-cleaner','打掃','Cleaning'], ['plant','園藝','Gardening'], ['paw','寵物','Pet'], ['baby-carriage','育兒','Childcare'], ['heart-handshake','照顧','Care'], ['friends','朋友','Friends'], ['gift','禮物','Gift'], ['cake','生日','Birthday'],
  ],
  leisure: [
    ['device-gamepad-2','遊戲','Gaming'], ['movie','電影','Movie'], ['music','音樂','Music'], ['headphones','聽音樂','Listening'], ['microphone','唱歌','Singing'], ['guitar-pick','樂器','Instrument'], ['camera','攝影','Photography'], ['brush','繪畫','Painting'], ['puzzle','拼圖','Puzzle'], ['dice','桌遊','Board game'], ['ball-football','足球','Football'], ['ball-basketball','籃球','Basketball'], ['ball-tennis','網球','Tennis'], ['run','跑步','Running'], ['walk','散步','Walking'], ['bike','單車','Cycling'], ['swimming','游泳','Swimming'], ['barbell','健身','Workout'], ['yoga','瑜伽','Yoga'], ['mountain','登山','Hiking'], ['tent','露營','Camping'], ['beach','海灘','Beach'], ['fish','釣魚','Fishing'], ['ticket','活動票券','Event'], ['confetti','慶祝','Celebration'],
  ],
  health: [
    ['stethoscope','看醫生','Doctor'], ['hospital','醫院','Hospital'], ['first-aid-kit','急救','First aid'], ['pill','服藥','Medication'], ['vaccine','疫苗','Vaccine'], ['dental','牙醫','Dentist'], ['eye','眼科','Eye care'], ['heart','健康','Health'], ['heartbeat','心率','Heartbeat'], ['thermometer','體溫','Temperature'], ['bandage','包紮','Bandage'], ['massage','按摩','Massage'], ['brain','心理健康','Mental health'], ['lungs','呼吸','Breathing'], ['stretching','伸展','Stretching'],
  ],
  travel: [
    ['bus','通勤','Commute'], ['car','開車','Driving'], ['train','火車','Train'], ['plane','搭機','Flight'], ['ship','搭船','Boat'], ['motorbike','機車','Motorcycle'], ['car-suv','計程車','Taxi'], ['map','地圖','Map'], ['map-pin','地點','Location'], ['luggage','旅行','Travel'], ['building-bank','銀行','Bank'], ['building-store','商店','Store'], ['gas-station','加油','Fuel'], ['parking','停車','Parking'], ['world','出國','Abroad'],
  ],
  schedule: [
    ['calendar-event','時段行程','Activity'], ['calendar','日行程','Day schedule'], ['calendar-week','周行程','Week schedule'], ['calendar-stats','周序列行程','Week sequence'], ['clock','時間','Time'], ['alarm','提醒','Alarm'], ['sun','早晨','Morning'], ['sunset','傍晚','Evening'], ['moon','夜晚','Night'], ['star','重要','Important'], ['flag','目標','Goal'], ['check','完成','Done'], ['hourglass','等待','Waiting'], ['repeat','重複','Repeat'], ['list-details','計畫','Plan'], ['route','路線','Route'], ['calendar-check','預約','Appointment'], ['calendar-off','休假','Day off'], ['calendar-time','期限','Deadline'], ['sparkles','特別活動','Special event'],
  ],
};

export const categories = Object.keys(groups);
export const catalog = Object.entries(groups).flatMap(([category, items]) => items.map(([name, zh, en]) => ({ id: `tabler:${name}`, category, zh, en })));
export const iconLabel = (item, locale) => locale === 'zh-TW' ? item.zh : item.en;
export const legacyIcons = { slot: 'tabler:calendar-event', commute: 'tabler:bus', work: 'tabler:briefcase', rest: 'tabler:armchair', sleep: 'tabler:bed' };
export const canonicalIconName = (name) => Object.hasOwn(legacyIcons, name) ? legacyIcons[name] : name;
export function findIcons(search, category = 'all') {
  const query = search.trim().toLocaleLowerCase();
  return catalog.filter((item) => (category === 'all' || item.category === category) && `${item.id} ${item.zh} ${item.en}`.toLocaleLowerCase().includes(query));
}
