/**
 * Credits copy, kept apart from layout so a name or fact can be corrected here alone.
 * Every line was checked against the original map's loading screen or the Hive Workshop thread;
 * do not add names, dates or links that those sources do not support.
 */

export type CreditEntry = { readonly name: string; readonly text: string };

export type CreditSection = { readonly heading: string; readonly entries: readonly CreditEntry[] };

export type CreditsContent = {
  readonly title: string;
  readonly subtitle: string;
  readonly intro: string;
  readonly sections: readonly CreditSection[];
  readonly about: { readonly heading: string; readonly paragraphs: readonly string[] };
  readonly sources: { readonly before: string; readonly linkText: string; readonly href: string; readonly after: string };
};

export const CREDITS: CreditsContent = {
  title: '致敬',
  subtitle: 'Hook Brawl 是一封寫給《勾肥大戰》的情書。',
  intro:
    '這個遊戲的玩法不是我們發明的。隔著一條河、只靠一支鉤子決勝負的點子，來自魔獸爭霸 III 的自訂地圖 Pudge Wars。我們只是想讓它在瀏覽器裡再活一次。',
  sections: [
    {
      heading: '原作與歷代作者',
      entries: [
        {
          name: '最初的 Pudge Wars',
          text: '3 對 3、只有鉤子和地雷的原型。作者的名字我們沒能查到。如果你知道，請告訴我們，這一行是留給他的。',
        },
        {
          name: 'Tossrock',
          text: 'Pudge Wars Advanced 的作者。他覺得原版好玩但可以更好，於是把一招鉤子擴充成一整套升級、道具和戰術。我們參考的玩法骨架出自他手。',
        },
        { name: 'Siraraz', text: '2010 年接手維護，把地圖帶到 2.x 版。' },
        { name: 'X-cat-x', text: '《勾肥大戰》繁體中文版作者。台灣玩家記憶裡的那個版本是他翻的。' },
        {
          name: 'kunkka',
          text: '原地圖載入畫面的繪師（kunkka.deviantart.com）。那張圖是很多人對這張地圖的第一印象。',
        },
      ],
    },
    {
      heading: '站在誰的肩膀上',
      entries: [
        { name: 'DotA 與它歷代的開發者和社群', text: '肉鉤這個技能和那位屠夫，都是從 DotA 來的。' },
        {
          name: 'Blizzard Entertainment',
          text: '魔獸爭霸 III 和 World Editor。沒有那個編輯器，就沒有這一整個世代的自訂地圖。',
        },
        {
          name: 'IceStoneb',
          text: '我們是看著他 2016 年上傳的《勾肥》對戰影片，把當年的手感一點一點想起來的。',
        },
      ],
    },
    {
      heading: '美術素材',
      entries: [
        {
          name: 'Kay Lousberg',
          text: '角色和場景的 3D 模型來自 KayKit 系列（Adventurers、Dungeon Remastered），以 CC0 授權釋出（www.kaylousberg.com）。',
        },
      ],
    },
  ],
  about: {
    heading: '關於這個專案',
    paragraphs: [
      'Hook Brawl 是非官方的同人致敬作品，與上述任何作者或公司沒有關係，也沒有使用原地圖的任何圖像、模型、音效或程式碼。角色、美術和場地都是重新設計的。Warcraft、Dota 及相關名稱是其各自權利人的商標。',
      '如果你是上面任何一位作者，希望我們修改或移除關於你的內容，請跟我們說。',
    ],
  },
  sources: {
    before: '資料來源：原地圖載入畫面、',
    linkText: 'Hive Workshop 的 Pudge Wars 討論串',
    href: 'https://www.hiveworkshop.com/threads/pudge-wars-v2-03d.178683/',
    after: '。',
  },
};
