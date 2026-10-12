/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/eval/dataset.ts (MIT).
 */

/*
 * The privacy model evaluation set: Korean, English and mixed legal and financial text, with the
 * people, organisations and addresses marked. Every sample is written here, so no candidate model
 * can have trained on it, and it is generated from a fixed seed, so every run measures the same text.
 *
 * Markup: `{PERSON:김지원}`, `{ORG:주식회사 한빛}`, `{ADDRESS:서울특별시 강남구 테헤란로 152}`. A
 * particle or honorific written after the closing brace is outside the entity, as it should be.
 *
 * Synthetic text flatters a model and hand-written text is small, so the report gives both apart.
 */

export type GoldCategory = 'PERSON' | 'ORG' | 'ADDRESS'
export type GoldSpan = {
  category: GoldCategory
  start: number
  end: number
  value: string
}
export type Sample = {
  id: string
  lang: 'ko' | 'en' | 'mixed'
  source: 'generated' | 'handwritten' | 'negative'
  text: string
  gold: GoldSpan[]
}

const MARK = /\{(PERSON|ORG|ADDRESS):([^{}]+)\}/g

export function parseMarkup(
  id: string,
  lang: Sample['lang'],
  source: Sample['source'],
  marked: string,
): Sample {
  const gold: GoldSpan[] = []
  let text = ''
  let last = 0
  for (const match of marked.matchAll(MARK)) {
    text += marked.slice(last, match.index)
    const value = match[2]
    gold.push({
      category: match[1] as GoldCategory,
      start: text.length,
      end: text.length + value.length,
      value,
    })
    text += value
    last = (match.index ?? 0) + match[0].length
  }
  text += marked.slice(last)
  return { id, lang, source, text, gold }
}

/** Mulberry32: small, seeded, the same on every machine. */
function prng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KO_SURNAMES = [
  '김',
  '이',
  '박',
  '최',
  '정',
  '강',
  '조',
  '윤',
  '장',
  '임',
  '한',
  '오',
  '서',
  '신',
  '권',
  '황',
  '안',
  '송',
  '류',
  '홍',
  '전',
  '고',
  '문',
  '양',
  '손',
  '배',
  '백',
  '허',
  '남궁',
  '선우',
]
const KO_GIVEN = [
  '지원',
  '서준',
  '하은',
  '민호',
  '수빈',
  '예린',
  '도윤',
  '서연',
  '현우',
  '지아',
  '태민',
  '유진',
  '승훈',
  '다은',
  '준혁',
  '소율',
  '재영',
  '은비',
  '성민',
  '가윤',
  '시우',
  '채원',
  '동현',
  '나연',
  '우진',
  '혜린',
  '정호',
  '윤아',
  '경민',
  '보람',
]
const EN_FIRST = [
  'Olivia',
  'Liam',
  'Emma',
  'Noah',
  'Ava',
  'Ethan',
  'Sophia',
  'Mason',
  'Isabella',
  'Lucas',
  'Mia',
  'Henry',
  'Charlotte',
  'Daniel',
  'Amelia',
  'Samuel',
  'Harper',
  'Owen',
  'Evelyn',
  'Caleb',
  'Priya',
  'Rahul',
  'Mei',
  'Kenji',
  'Fatima',
  'Diego',
]
const EN_LAST = [
  'Johnson',
  'Martinez',
  'Thompson',
  'Garcia',
  'Robinson',
  'Clark',
  'Lewis',
  'Walker',
  'Hall',
  'Allen',
  'Young',
  'Wright',
  'Scott',
  'Green',
  'Baker',
  'Nelson',
  'Carter',
  'Mitchell',
  'Patel',
  'Nakamura',
  'Okafor',
  'Fernandez',
  'Novak',
  'Lindqvist',
]
const KO_ORG_STEMS = [
  '한빛',
  '새솔',
  '미래온',
  '대흥',
  '청람',
  '누리',
  '하나로',
  '동방',
  '태성',
  '보성',
  '금강',
  '세움',
  '온누리',
  '다온',
  '한결',
]
const KO_ORG_FORMS = (stem: string) => [
  `주식회사 ${stem}`,
  `(주)${stem}`,
  `${stem}은행`,
  `${stem}증권`,
  `${stem}캐피탈`,
  `${stem}건설 주식회사`,
  `${stem}법무법인`,
  `${stem}회계법인`,
]
const EN_ORG_STEMS = [
  'Northwind',
  'Bluecrest',
  'Harborline',
  'Stonebridge',
  'Crescent',
  'Ironwood',
  'Silverleaf',
  'Meridian',
  'Oakridge',
  'Brightwater',
]
const EN_ORG_FORMS = (stem: string) => [
  `${stem} Holdings Inc.`,
  `${stem} Capital LLC`,
  `${stem} Partners LLP`,
  `${stem} Bank`,
  `${stem} Logistics Ltd.`,
  `${stem} Robotics Corp.`,
]
const KO_CITIES: Array<[string, string[]]> = [
  ['서울특별시', ['강남구', '서초구', '마포구', '종로구', '영등포구']],
  ['부산광역시', ['해운대구', '수영구', '동래구']],
  ['경기도 성남시', ['분당구', '수정구']],
  ['인천광역시', ['연수구', '남동구']],
  ['대전광역시', ['유성구', '서구']],
]
const KO_ROADS = [
  '테헤란로',
  '강남대로',
  '세종대로',
  '올림픽로',
  '판교역로',
  '해운대해변로',
  '도산대로',
  '양재천로',
  '센텀중앙로',
]
const EN_STREETS = [
  'Main Street',
  'Oak Avenue',
  'Maple Drive',
  'Harbor Road',
  'Market Street',
  'Pine Lane',
  'Elm Boulevard',
]
const EN_CITIES = [
  'Springfield, IL 62704',
  'Austin, TX 78701',
  'Portland, OR 97205',
  'Boston, MA 02110',
  'San Jose, CA 95113',
]

function makeGenerator(seed: number) {
  const random = prng(seed)
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)]
  const int = (low: number, high: number) =>
    low + Math.floor(random() * (high - low + 1))
  return {
    pick,
    int,
    koPerson: () => `${pick(KO_SURNAMES)}${pick(KO_GIVEN)}`,
    enPerson: () => `${pick(EN_FIRST)} ${pick(EN_LAST)}`,
    koOrg: () => pick(KO_ORG_FORMS(pick(KO_ORG_STEMS))),
    enOrg: () => pick(EN_ORG_FORMS(pick(EN_ORG_STEMS))),
    koAddress: () => {
      const [city, districts] = pick(KO_CITIES)
      const tail =
        random() < 0.5
          ? `, ${int(1, 25)}층`
          : ` ${int(101, 112)}동 ${int(101, 2304)}호`
      return `${city} ${pick(districts)} ${pick(KO_ROADS)} ${int(1, 400)}${tail}`
    },
    enAddress: () =>
      `${int(10, 9800)} ${pick(EN_STREETS)}, ${random() < 0.4 ? `Suite ${int(100, 2400)}, ` : ''}${pick(EN_CITIES)}`,
    amount: () => `₩${(int(1, 900) * 1_000_000).toLocaleString('en-US')}`,
    usd: () => `$${(int(5, 950) * 1_000).toLocaleString('en-US')}`,
    date: () => `${int(2024, 2027)}년 ${int(1, 12)}월 ${int(1, 28)}일`,
    enDate: () =>
      `${pick(['January', 'March', 'May', 'July', 'September', 'November'])} ${int(1, 28)}, ${int(2024, 2027)}`,
  }
}

type Gen = ReturnType<typeof makeGenerator>

/* Korean particles and honorifics stay outside the braces: they are not part of the name. */
const KO_TEMPLATES: Array<(g: Gen) => string> = [
  (g) =>
    `매도인 {PERSON:${g.koPerson()}}(이하 "갑")과 매수인 {ORG:${g.koOrg()}}(이하 "을")은 다음과 같이 부동산 매매계약을 체결한다.`,
  (g) =>
    `{PERSON:${g.koPerson()}}님은 ${g.date()}까지 대여금 ${g.amount()}을 {ORG:${g.koOrg()}}에 상환하여야 한다.`,
  (g) =>
    `임대인 {PERSON:${g.koPerson()}}의 주소는 {ADDRESS:${g.koAddress()}}이며, 임차인은 보증금 ${g.amount()}을 지급한다.`,
  (g) =>
    `본 확인서는 {ORG:${g.koOrg()}} 대표이사 {PERSON:${g.koPerson()}}가 ${g.date()} 작성하였다.`,
  (g) =>
    `채무자 {PERSON:${g.koPerson()}} 씨는 연체이자 연 12%를 포함한 ${g.amount()}을 지급할 의무가 있다.`,
  (g) =>
    `원고 {PERSON:${g.koPerson()}}은 피고 {PERSON:${g.koPerson()}}를 상대로 손해배상금 ${g.amount()}의 지급을 청구한다.`,
  (g) =>
    `제7조(통지) 모든 통지는 {ADDRESS:${g.koAddress()}}로 서면 발송한다. 담당자: {PERSON:${g.koPerson()}} 과장.`,
  (g) =>
    `{ORG:${g.koOrg()}}은 ${g.date()} 이사회 결의에 따라 {ORG:${g.koOrg()}}과의 합병을 승인하였다.`,
  (g) =>
    `회의 참석자: {PERSON:${g.koPerson()}} 부장, {PERSON:${g.koPerson()}} 차장, {PERSON:${g.koPerson()}} 대리.`,
  (g) =>
    `연대보증인 {PERSON:${g.koPerson()}}께서는 주채무자의 채무 전액에 대하여 연대하여 책임을 진다.`,
  (g) =>
    `감사인 {ORG:${g.koOrg()}}은 ${g.date()}자 재무제표에 대하여 적정의견을 표명하였다.`,
  (g) =>
    `{PERSON:${g.koPerson()}} 변호사는 {ORG:${g.koOrg()}}의 소송대리인으로서 답변서를 제출하였다.`,
  (g) =>
    `사업장 소재지 {ADDRESS:${g.koAddress()}}, 대표자 {PERSON:${g.koPerson()}}, 업태 서비스.`,
  (g) =>
    `수탁자는 {PERSON:${g.koPerson()}}에게 매 분기 운용보고서를 교부하고, 수수료는 연 0.8%로 한다.`,
  (g) =>
    `양도인 {ORG:${g.koOrg()}}은 양수인 {PERSON:${g.koPerson()}}에게 해당 채권을 ${g.amount()}에 양도한다.`,
  (g) =>
    `피보험자 {PERSON:${g.koPerson()}}의 사고 장소는 {ADDRESS:${g.koAddress()}} 인근 교차로이다.`,
]

const EN_TEMPLATES: Array<(g: Gen) => string> = [
  (g) =>
    `This Loan Agreement is made on ${g.enDate()} between {ORG:${g.enOrg()}} (the "Lender") and {PERSON:${g.enPerson()}} (the "Borrower").`,
  (g) =>
    `The Borrower shall repay the principal of ${g.usd()} to {ORG:${g.enOrg()}} no later than ${g.enDate()}.`,
  (g) =>
    `Notices shall be sent to {PERSON:${g.enPerson()}}, General Counsel, at {ADDRESS:${g.enAddress()}}.`,
  (g) =>
    `{PERSON:${g.enPerson()}}, Chief Financial Officer of {ORG:${g.enOrg()}}, certifies that the statements are accurate.`,
  (g) =>
    `Section 4.2 Guarantee. {PERSON:${g.enPerson()}} irrevocably guarantees the obligations of {ORG:${g.enOrg()}}.`,
  (g) =>
    `Attendees: {PERSON:${g.enPerson()}} (Chair), {PERSON:${g.enPerson()}}, and {PERSON:${g.enPerson()}} (Secretary).`,
  (g) =>
    `The premises located at {ADDRESS:${g.enAddress()}} are leased to {ORG:${g.enOrg()}} for a monthly rent of ${g.usd()}.`,
  (g) =>
    `Per the engagement letter, {ORG:${g.enOrg()}} will audit {ORG:${g.enOrg()}} for the fiscal year ending ${g.enDate()}.`,
  (g) =>
    `Plaintiff {PERSON:${g.enPerson()}} alleges that Defendant breached Clause 9 by failing to pay ${g.usd()}.`,
  (g) =>
    `Wire instructions were confirmed by {PERSON:${g.enPerson()}} on ${g.enDate()}; the escrow agent is {ORG:${g.enOrg()}}.`,
]

const MIXED_TEMPLATES: Array<(g: Gen) => string> = [
  (g) =>
    `{ORG:${g.enOrg()}}와 {ORG:${g.koOrg()}} 간 MOU 체결. 담당: {PERSON:${g.enPerson()}}, {PERSON:${g.koPerson()}} 팀장.`,
  (g) =>
    `Please review the 대출약정서 sent by {PERSON:${g.koPerson()}}님 before ${g.enDate()}.`,
  (g) =>
    `송금인 {PERSON:${g.enPerson()}}, 수취인 {ORG:${g.koOrg()}}, 금액 ${g.usd()} (FX settlement T+2).`,
  (g) =>
    `The office at {ADDRESS:${g.koAddress()}} will host the closing; {PERSON:${g.koPerson()}} will sign for {ORG:${g.koOrg()}}.`,
]

/** Text with no people, organisations or addresses, written to tempt a model into false alarms. */
const NEGATIVES = [
  `제3조(대금의 지급) ① "을"은 계약금 ₩50,000,000을 계약 체결 시에 지급하고, 잔금은 2026년 5월 31일까지 지급한다.`,
  `매도인과 매수인은 본 계약의 해석에 관하여 이견이 있는 경우 상호 협의하여 해결한다.`,
  `연 이자율은 4.75%로 하며, 지연손해금은 약정이자율에 연 3%를 가산한 비율로 한다.`,
  `본 계약은 대한민국 법률에 따라 해석되며, 관할 법원은 피고 주소지 관할 법원으로 한다.`,
  `당기순이익은 전년 대비 12.3% 증가한 1,240억 원이며, 영업이익률은 8.1%를 기록하였다.`,
  `임차인은 임대인의 사전 서면 동의 없이 목적물을 전대할 수 없다.`,
  `회사는 정관 제14조에 따라 주주총회 소집을 통지하여야 한다.`,
  `The Borrower shall maintain a Debt Service Coverage Ratio of not less than 1.25x as of each Quarter Date.`,
  `"Effective Date" means the date on which all Conditions Precedent have been satisfied or waived.`,
  `Interest shall accrue at SOFR plus 2.15% per annum, calculated on a 360-day basis.`,
  `The Parties agree that Section 12 (Confidentiality) shall survive termination of this Agreement.`,
  `Net revenue grew 18% year over year to $4.2 million, driven by the Enterprise tier.`,
  `Force Majeure Event includes acts of God, war, pandemic and government action.`,
  `The Guarantor waives any right to require the Lender to proceed first against the Borrower.`,
  `Q3 EBITDA margin: 22.4%; CapEx: $310,000; Working Capital Adjustment per Schedule B.`,
  `관리인은 매월 말일 기준 잔액 증명서를 발급하며, 수수료는 건당 3,000원이다.`,
  `본 약관에서 정하지 아니한 사항은 관계 법령 및 일반 상관례에 따른다.`,
  `Annex A lists the Permitted Liens; Annex B lists the Material Contracts.`,
  `갑은 을에게 목적물을 인도하고, 을은 갑에게 대금을 지급한다.`,
  `Terms in Title Case such as Closing Date, Purchase Price and Escrow Amount are defined in Article 1.`,
]

/** Written by hand from the shapes real contracts and statements take, names invented. */
const HANDWRITTEN: Array<[Sample['lang'], string]> = [
  [
    'ko',
    `주식회사 {ORG:새솔테크}(대표이사 {PERSON:한도윤}, 이하 "회사")는 {PERSON:문채원}(이하 "근로자")과 다음과 같이 근로계약을 체결한다. 근무 장소: {ADDRESS:서울특별시 마포구 월드컵북로 396} 9층.`,
  ],
  [
    'ko',
    `[확인서] 본인 {PERSON:권태민}은 {ORG:청람저축은행}으로부터 차용한 금 오천만원(₩50,000,000)을 2026. 12. 31.까지 변제할 것을 확인합니다.`,
  ],
  [
    'ko',
    `{PERSON:정유진} 님, 요청하신 잔고증명서를 첨부드립니다. 문의는 {ORG:다온증권} 압구정지점 {PERSON:오성민} 대리에게 연락 바랍니다.`,
  ],
  [
    'ko',
    `소장. 원고 {PERSON:배나연}, 주소 {ADDRESS:부산광역시 해운대구 센텀중앙로 79, 1203호}. 피고 {ORG:주식회사 태성물산}. 청구취지: 피고는 원고에게 32,000,000원을 지급하라.`,
  ],
  [
    'ko',
    `이사회 의사록: 의장 {PERSON:남궁경민}이 개회를 선언하고, 사외이사 {PERSON:선우혜린}의 동의로 안건 제1호를 가결하였다.`,
  ],
  [
    'ko',
    `세금계산서 공급자: {ORG:(주)한결물류}, 사업장 {ADDRESS:경기도 성남시 분당구 판교역로 235}, 담당 {PERSON:임재영}.`,
  ],
  [
    'ko',
    `{PERSON:송다은}씨의 대출 심사 결과 신용등급 3등급, 한도 1억 2천만원이 승인되었습니다.`,
  ],
  [
    'en',
    `MEMORANDUM. To: {PERSON:Charlotte Novak}. From: {PERSON:Daniel Okafor}, {ORG:Bluecrest Capital LLC}. Re: Series B term sheet, pre-money valuation $48,000,000.`,
  ],
  [
    'en',
    `{ORG:Harborline Logistics Ltd.} ("Seller") agrees to sell, and {ORG:Ironwood Holdings Inc.} ("Buyer") agrees to buy, all outstanding shares for $12.5 million.`,
  ],
  [
    'en',
    `Deposition of {PERSON:Mei Nakamura}, taken at the offices of {ORG:Meridian Partners LLP}, {ADDRESS:200 Market Street, Suite 1400, Boston, MA 02110}.`,
  ],
  [
    'en',
    `Hi {PERSON:Rahul}, the KYC file for {PERSON:Fatima Fernandez} is missing proof of address; please ask her to upload a recent utility bill.`,
  ],
  [
    'en',
    `Landlord: {PERSON:Evelyn Lindqvist}. Tenant: {PERSON:Owen Mitchell}. Premises: {ADDRESS:4410 Pine Lane, Portland, OR 97205}. Term: 24 months.`,
  ],
  [
    'mixed',
    `{PERSON:Kenji Nakamura} (CFO) 및 {PERSON:유하은} 상무가 {ORG:Stonebridge Bank}와 신디케이트론 조건을 협의함. Margin 1.9%, tenor 5Y.`,
  ],
  [
    'mixed',
    `FYI: {ORG:누리캐피탈} credit committee approved the facility. Contact {PERSON:최승훈} at {ADDRESS:서울특별시 영등포구 국제금융로 10} for closing docs.`,
  ],
  [
    'ko',
    `유언자 {PERSON:황보람}은 그 소유의 {ADDRESS:대전광역시 유성구 대학로 99} 소재 토지를 장남 {PERSON:황시우}에게 유증한다.`,
  ],
  [
    'ko',
    `{ORG:금강회계법인}은 {ORG:동방건설 주식회사}의 2025 회계연도 재무제표를 감사하였으며, 담당 회계사는 {PERSON:전소율}이다.`,
  ],
]

export function buildEvaluationSet(seed = 20261006): Sample[] {
  const g = makeGenerator(seed)
  const samples: Sample[] = []
  const add = (
    lang: Sample['lang'],
    templates: Array<(g: Gen) => string>,
    count: number,
  ) => {
    for (let index = 0; index < count; index += 1) {
      samples.push(
        parseMarkup(
          `${lang}-${index}`,
          lang,
          'generated',
          templates[index % templates.length](g),
        ),
      )
    }
  }
  add('ko', KO_TEMPLATES, 192)
  add('en', EN_TEMPLATES, 120)
  add('mixed', MIXED_TEMPLATES, 48)
  for (const [index, text] of NEGATIVES.entries()) {
    samples.push({
      id: `neg-${index}`,
      lang: /[가-힣]/.test(text) ? 'ko' : 'en',
      source: 'negative',
      text,
      gold: [],
    })
  }
  for (const [index, [lang, marked]] of HANDWRITTEN.entries()) {
    samples.push(parseMarkup(`hand-${index}`, lang, 'handwritten', marked))
  }
  return samples
}

/** About 1,000 characters of mixed contract text, for the latency measurement. */
export function latencyDocument(): string {
  const set = buildEvaluationSet(7)
  let text = ''
  for (const sample of set) {
    if (text.length >= 1000) break
    text += `${sample.text} `
  }
  return text.slice(0, 1000)
}
