import type { RoomLanguage } from './i18n';

export const BOOK_IDS = ['book.dune', 'book.foundation', 'book.neuromancer', 'book.three-body-problem'] as const;
export type BookId = typeof BOOK_IDS[number];
export const isBookId = (id: unknown): id is BookId => typeof id === 'string' && (BOOK_IDS as readonly string[]).includes(id);

interface BookDetails {
  title: Record<RoomLanguage, string>;
  author: Record<RoomLanguage, string>;
  year: number;
  genre: Record<RoomLanguage, string>;
  synopsis: Record<RoomLanguage, string>;
  publicationNote?: Record<RoomLanguage, string>;
  sources: { label: string; url: string }[];
}

/** Original works, not bibliographic claims about the decorative cover editions. */
export const BOOKS: Record<BookId, BookDetails> = {
  'book.dune': {
    title: { zh: '沙丘', en: 'Dune' }, author: { zh: '弗兰克·赫伯特', en: 'Frank Herbert' }, year: 1965,
    genre: { zh: '史诗科幻 · 生态与权力', en: 'Epic science fiction · Ecology & power' },
    synopsis: { zh: '在水比生命还珍贵的沙漠星球厄拉科斯，稀有香料牵动着整个帝国的命运。少年保罗随家族来到这里，逐渐走进政治角力与陌生的生存法则。小说以沙虫、荒漠与预言为线索，追问资源、信仰和权力如何塑造一个世界。', en: 'On the desert planet Arrakis, a rare substance called spice shapes the fate of an empire. Young Paul arrives with his family and enters a world of political struggles and unfamiliar rules of survival. Sandworms, scarcity and prophecy frame a story about how resources, belief and power transform a society.' },
    sources: [{ label: 'Penguin Random House', url: 'https://penguinrandomhousehighereducation.com/book/?isbn=9780441172719' }],
  },
  'book.foundation': {
    title: { zh: '基地', en: 'Foundation' }, author: { zh: '艾萨克·阿西莫夫', en: 'Isaac Asimov' }, year: 1951,
    genre: { zh: '社会科幻 · 文明与历史', en: 'Social science fiction · Civilization & history' },
    synopsis: { zh: '银河帝国表面的繁荣之下，漫长衰退已悄然开始。数学家哈里·谢顿借助心理史学预测未来，试图为文明保存知识的火种。一群被派往银河边缘的人必须应对接连而来的危机，在政治、信仰与贸易之间寻找延续文明的道路。', en: 'Beneath the Galactic Empire’s apparent prosperity, a long decline has begun. Mathematician Hari Seldon uses psychohistory to predict the future and preserve humanity’s knowledge. On the edge of the galaxy, a small community faces successive crises through politics, belief and trade.' },
    sources: [{ label: 'Penguin Random House', url: 'https://www.penguinrandomhouse.com/books/5655/foundation-by-isaac-asimov/' }, { label: 'The Folio Society', url: 'https://www.foliosociety.com/uk/the-foundation-trilogy' }],
  },
  'book.neuromancer': {
    title: { zh: '神经漫游者', en: 'Neuromancer' }, author: { zh: '威廉·吉布森', en: 'William Gibson' }, year: 1984,
    genre: { zh: '赛博朋克 · 网络与意识', en: 'Cyberpunk · Cyberspace & identity' },
    synopsis: { zh: '曾经的顶尖黑客凯斯失去了连接网络空间的能力，在霓虹与阴影交错的城市边缘求生。一份神秘委托给了他重返数字世界的机会，也让他卷入危险的任务。人工智能、身体改造与企业权力交织，人与机器的边界变得难以辨认。', en: 'Once an elite hacker, Case can no longer enter cyberspace and survives at the margins of a neon-lit city. A mysterious offer promises a way back into the digital world, at the price of a dangerous job. Artificial intelligence, altered bodies and corporate power blur the boundaries between people and machines.' },
    sources: [{ label: 'Penguin Random House', url: 'https://www.penguinrandomhouse.com/books/538861/neuromancer-by-william-gibson/' }],
  },
  'book.three-body-problem': {
    title: { zh: '三体', en: 'The Three-Body Problem' }, author: { zh: '刘慈欣', en: 'Cixin Liu' }, year: 2008,
    genre: { zh: '硬科幻 · 科学悬疑', en: 'Hard science fiction · Scientific mystery' },
    synopsis: { zh: '一连串令人不安的科学异象，将纳米材料研究者汪淼带入一款神秘游戏与一段被尘封的往事。跨越数十年的线索逐渐交汇，人类对宇宙的认识面临挑战。小说从个人的困惑与选择出发，展开关于科学、信任和文明命运的追问。', en: 'A series of unsettling scientific anomalies draws nanomaterials researcher Wang Miao into a mysterious game and a buried history. Clues spanning decades begin to converge, challenging humanity’s understanding of the universe. Personal choices open into questions about science, trust and the future of civilization.' },
    publicationNote: { zh: '2006 年开始连载；2008 年出版中文单行本；2014 年出版刘宇昆英译本。', en: 'Serialized in Chinese in 2006; first Chinese book edition in 2008; Ken Liu’s English translation appeared in 2014.' },
    sources: [{ label: 'Tor / Macmillan', url: 'https://us.macmillan.com/books/9781466853447/thethreebodyproblem/' }, { label: '科幻世界', url: 'https://www.sfw.com.cn/go-c106.htm' }],
  },
};

export const BOOK_COPY = {
  en: { open: 'Books', collection: 'Cabinet bookshelf', close: 'Close book details', author: 'Author', year: 'First book publication', synopsis: 'About the book', sources: 'Sources', note: 'Original decorative covers. These details describe the works, not a specific edition.', select: 'Choose a book', unavailable: 'The books could not load. Refresh the page to try again.', retry: 'Refresh page' },
  zh: { open: '书籍', collection: '柜顶书单', close: '关闭书籍介绍', author: '作者', year: '原作首版（单行本）', synopsis: '内容简介', sources: '资料来源', note: '封面为原创装饰设计，以上资料介绍原著作品，不对应特定出版版本。', select: '选择一本书', unavailable: '书籍模型未能加载，请刷新页面重试。', retry: '刷新页面' },
};
