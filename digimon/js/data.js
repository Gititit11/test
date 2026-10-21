/* 디지몬 육성 — 기획안의 표를 그대로 옮긴 데이터
 *
 * 수치를 고칠 때는 여기만 바꾸면 된다. 판정 로직은 engine.js 에 있다.
 * 이름은 한국 더빙판(나무위키 표기)을 따른다.
 * 브라우저에서는 전역 DigiData, node 에서는 require 로 쓴다.
 */
var DigiData = (function () {
  'use strict';

  var STAGES = ['baby1', 'baby2', 'child', 'adult', 'perfect', 'ultimate'];
  var STAGE_NAMES = {
    baby1: '유년기1', baby2: '유년기2', child: '성장기',
    adult: '성숙기', perfect: '완전체', ultimate: '궁극체'
  };
  var ATTR_NAMES = { vaccine: '백신', data: '데이터', virus: '바이러스', free: '프리' };
  var GRADE_NAMES = { normal: '일반', rare: '희귀', boss: '보스', legend: '전설' };

  // 시간은 모두 실시간. 초기에는 느슨하게 잡고 해 보면서 조인다.
  var RULES = {
    stageHours: { baby1: 1, baby2: 24, child: 72, adult: 96, perfect: 120 },
    lifespanHours: 480,        // 20일. 궁극체는 이때까지 산다
    failLifespanCutHours: 24,  // 성숙기 → 완전체 진화 실패 때 줄어드는 수명
    callMinutes: 15,           // 배고픔·힘 호출을 이만큼 넘게 두면 케어 실수
    poopLimitMinutes: 180,     // 배변을 이만큼 넘게 두면 위생 실수
    sleepLightsMinutes: 30,    // 잠든 뒤 불을 이만큼 넘게 안 끄면 수면 방해
    wakeMinutes: 10,           // 깨우면 이만큼 깨어 있다가 다시 잔다
    hungerEvery: { baby1: 10, baby2: 45, child: 60, adult: 75, perfect: 90, ultimate: 100 },
    strengthEvery: { baby1: 12, baby2: 55, child: 70, adult: 90, perfect: 110, ultimate: 120 },
    poopEvery: { baby1: 20, baby2: 120, child: 180, adult: 180, perfect: 200, ultimate: 220 },
    maxPoops: 8,
    // [잠드는 시, 깨는 시] (기기 현지 시각). 유년기1 은 한 시간뿐이라 자지 않는다.
    sleep: { baby1: null, baby2: [20, 8], child: [21, 7], adult: [21, 7], perfect: [22, 7], ultimate: [22, 7] },
    armorHours: 48,
    previewHours: 24,          // 잘못된 진화가 오기 이만큼 전부터 색이 어두워진다
    jogressBossWins: 3,        // ⑩ ⑲ 에 필요한 보스 격파 수
    slots: 6,                  // 한 번에 데리고 있을 수 있는 디지몬 (키우는 하나 + 보관함)
    scansPerDay: 5,
    hpMax: 100,
    stagePower: { child: 10, adult: 20, perfect: 34, ultimate: 52 },
    gradePower: { normal: 1, rare: 1.2, boss: 1.45, legend: 1.8 },
    // 스캔하면 내 단계와 같은 단계가 70%, 한 단계 위가 30%. 궁극체는 궁극체만.
    upChance: 0.3,
    // 나온 디지몬의 단계별 등급 확률
    gradeOdds: {
      child: { normal: 0.75, rare: 0.25 },
      adult: { normal: 0.75, rare: 0.25 },
      perfect: { normal: 0.70, rare: 0.24, boss: 0.06 },
      ultimate: { normal: 0.737, rare: 0.24, boss: 0.02, legend: 0.003 }
    },
    attrOdds: { vaccine: 0.3, data: 0.3, virus: 0.3, free: 0.1 },
    ignoreChance: 0.35         // 블리츠그레이몬이 명령을 무시할 확률
  };

  /* 종 정보
   *   mult     전투력 배율 (막다른 진화는 다음 단계가 없는 대신 높게 준다)
   *   terminal 더 진화하지 않는다
   *   armor    아머체 (48시간 뒤 브이몬으로 돌아간다)
   *   bossMult 보스에게 이만큼 강하다
   *   ignores  가끔 명령을 무시한다
   */
  var SPECIES = {};
  var ATTR_COLOR = { vaccine: '#f2a33a', data: '#6fa8dc', virus: '#8a5aa8', free: '#8fbf6a' };
  function sp(id, name, stage, attr, extra) {
    var o = { id: id, name: name, stage: stage, attr: attr, color: ATTR_COLOR[attr], mult: 1 };
    for (var k in extra || {}) o[k] = extra[k];
    SPECIES[id] = o;
  }
  var END = { terminal: true, mult: 1.3 };

  // 아구몬 라인
  sp('botamon', '깜몬', 'baby1', 'free');
  sp('koromon', '코로몬', 'baby2', 'free');
  sp('agumon', '아구몬', 'child', 'vaccine');
  sp('greymon', '그레이몬', 'adult', 'vaccine');
  sp('ogremon', '우가몬', 'adult', 'virus');
  sp('algomon_adult', '아르고몬', 'adult', 'virus');
  sp('coelamon', '씨라몬', 'adult', 'data');
  sp('metalgreymon', '메탈그레이몬', 'perfect', 'vaccine');
  sp('skullgreymon', '스컬그레이몬', 'perfect', 'virus', END);
  sp('metaltyranomon', '메탈티라노몬', 'perfect', 'virus');
  sp('andromon', '안드로몬', 'perfect', 'vaccine', END);
  sp('mamemon', '콩알몬', 'perfect', 'data', END);
  sp('neodevimon', '네오데블몬', 'perfect', 'virus');
  sp('anomalocarimon', '스콜피오몬', 'perfect', 'virus', END);
  sp('wargreymon', '워그레이몬', 'ultimate', 'vaccine');
  sp('blitzgreymon', '블리츠그레이몬', 'ultimate', 'vaccine', { mult: 1.35, ignores: true });
  sp('donedevimon', '던데블몬', 'ultimate', 'virus');
  sp('omegamon', '오메가몬', 'ultimate', 'vaccine', { mult: 1.25 });

  // 파피몬 라인
  sp('punimon', '푸니몬', 'baby1', 'free');
  sp('tsunomon', '뿔몬', 'baby2', 'free');
  sp('gabumon', '파피몬', 'child', 'data');
  sp('garurumon', '가루몬', 'adult', 'vaccine');
  sp('gorimon', '고릴라몬', 'adult', 'data');
  sp('dokugumon', '스파이더몬', 'adult', 'virus');
  sp('weregarurumon', '워가루몬', 'perfect', 'vaccine');
  sp('parrotmon', '패럿몬', 'perfect', 'data', END);
  sp('valvemon', '밸브몬', 'perfect', 'data', END);
  sp('bigmamemon', '빅콩알몬', 'perfect', 'data', END);
  sp('waruseadramon', '워시드라몬', 'perfect', 'virus');
  sp('orochimon', '오로치몬', 'perfect', 'virus', END);
  sp('metalgarurumon', '메탈가루몬', 'ultimate', 'data');
  sp('cresgarurumon', '크레스가루몬', 'ultimate', 'data');
  sp('nidhoggmon', '니드호그몬', 'ultimate', 'virus');

  // 브이몬 라인
  sp('chicomon', '치코몬', 'baby1', 'free');
  sp('chibimon', '꼬마몬', 'baby2', 'free');
  sp('veemon', '브이몬', 'child', 'free');
  sp('exveemon', '엑스브이몬', 'adult', 'free');
  sp('veedramon', '브이드라몬', 'adult', 'vaccine');
  sp('digitamamon', '디지타몬', 'adult', 'data', END);
  sp('flamedramon', '화염드라몬', 'adult', 'free', { armor: true, bossMult: 1.5 });
  sp('raidramon', '번개드라몬', 'adult', 'free', { armor: true, bossMult: 1.5 });
  sp('sagittarimon', '사수몬', 'adult', 'free', { armor: true, bossMult: 1.5 });
  sp('magnamon', '매그너몬', 'perfect', 'free', { armor: true, bossMult: 1.5 });
  sp('paildramon', '파일드라몬', 'perfect', 'free');
  sp('dinobeemon', '다이노몬', 'perfect', 'free', END);
  sp('aeroveedramon', '에어로브이드라몬', 'perfect', 'vaccine');
  sp('goldveedramon', '골드브이드라몬', 'perfect', 'vaccine', END);
  sp('ulforceveedramon', '알포스브이드라몬', 'ultimate', 'vaccine');
  sp('imperialdramon_dm', '황제드라몬 드래곤 모드', 'ultimate', 'free');
  sp('imperialdramon', '황제드라몬 파이터 모드', 'ultimate', 'free', { mult: 1.25 });

  // 야생 — 성장기
  sp('pulsemon', '펄스몬', 'child', 'vaccine');
  sp('vorvomon', '보르보몬', 'child', 'vaccine');
  sp('palmon', '팔몬', 'child', 'data');
  sp('sangomon', '산호몬', 'child', 'data');
  sp('sunarizamon', '샌드리자몬', 'child', 'data');
  sp('blucomon', '블루코몬', 'child', 'data');
  sp('hagurumon', '톱니몬', 'child', 'virus');
  sp('ghostmon', '아이고스몬', 'child', 'virus');
  sp('blackagumon', '아구몬(흑)', 'child', 'virus');
  sp('blackgabumon', '파피몬(흑)', 'child', 'virus');
  // 야생 — 성숙기
  sp('birdramon', '버드라몬', 'adult', 'vaccine');
  sp('yukidarumon', '프리지몬', 'adult', 'vaccine');
  sp('bulkmon', '벌크몬', 'adult', 'vaccine');
  sp('tortamon', '토타몬', 'adult', 'vaccine');
  sp('vermillimon', '버밀리몬', 'adult', 'vaccine');
  sp('tobiumon', '플라잉피쉬몬', 'adult', 'vaccine');
  sp('tyranomon', '티라노몬', 'adult', 'data');
  sp('seadramon', '시드라몬', 'adult', 'data');
  sp('shellmon', '쉘몬', 'adult', 'data');
  sp('sunflowmon', '해바라기몬', 'adult', 'data');
  sp('togemon', '니드몬', 'adult', 'data');
  sp('monochromon', '모노크로몬', 'adult', 'data');
  sp('ballistamon', '바리스타몬', 'adult', 'data');
  sp('wizarmon', '위자몬', 'adult', 'data');
  sp('paledramon', '팔레드라몬', 'adult', 'data');
  sp('lavorvomon', '라보보몬', 'adult', 'virus');
  sp('hyogamon', '블루우가몬', 'adult', 'virus');
  sp('raremon', '레어몬', 'adult', 'virus');
  sp('vegiemon', '베지몬', 'adult', 'virus');
  sp('octomon', '옥토몬', 'adult', 'virus');
  sp('golemon', '록몬', 'adult', 'virus');
  sp('bakemon', '고스몬', 'adult', 'virus');
  sp('devimon', '데블몬', 'adult', 'virus');
  sp('saberdramon', '블랙버드라몬', 'adult', 'virus');
  sp('darktyranomon', '다크티라노몬', 'adult', 'virus');
  sp('greymon_blue', '그레이몬(청)', 'adult', 'virus');
  sp('blackgarurumon', '가루몬(흑)', 'adult', 'virus');
  sp('digmon', '디그몬', 'adult', 'free');
  sp('machmon', '마하몬', 'adult', 'free');
  sp('namakemon', '나마케몬', 'adult', 'free');
  sp('moosemon', '무스몬', 'adult', 'free');
  sp('rhinomon', '리노몬', 'adult', 'free');
  // 야생 — 완전체
  sp('loaderleomon', '로더레오몬', 'perfect', 'vaccine');
  sp('gusokumon', '기간테우스몬', 'perfect', 'vaccine');
  sp('panjyamon', '화이트레오몬', 'perfect', 'vaccine');
  sp('mammothmon', '맘몬', 'perfect', 'vaccine');
  sp('mastertyranomon', '마스터티라노몬', 'perfect', 'vaccine');
  sp('cyberdramon', '사이버드라몬', 'perfect', 'vaccine');
  sp('locomon', '로코몬', 'perfect', 'data');
  sp('atlurballistamon', '아트라바리스타몬', 'perfect', 'data');
  sp('metalmamemon', '메탈콩알몬', 'perfect', 'data');
  sp('lilimon', '릴리몬', 'perfect', 'data');
  sp('mermaimon', '인어몬', 'perfect', 'data');
  sp('cryspaledramon', '크리스팔레드라몬', 'perfect', 'data');
  sp('flaremon', '플레어몬', 'perfect', 'data');
  sp('mailbirdramon', '메일버드라몬', 'perfect', 'data');
  sp('jaegerdorulumon', '예거도루루몬', 'perfect', 'data');
  sp('crescemon', '크레세몬', 'perfect', 'data');
  sp('pandamon', '팬더몬', 'perfect', 'data');
  sp('pumpmon', '펌프몬', 'perfect', 'data');
  sp('rebellimon', '리벨리몬', 'perfect', 'virus');
  sp('arukenimon', '아라크네몬', 'perfect', 'virus');
  sp('dagomon', '드라고몬', 'perfect', 'virus');
  sp('vulturemon', '벌처몬', 'perfect', 'virus');
  sp('mummymon', '미이라몬', 'perfect', 'virus');
  sp('jokermon', '조커몬', 'perfect', 'virus');
  sp('phantomon', '팬텀몬', 'perfect', 'virus');
  sp('baalmon', '바알몬', 'perfect', 'virus');
  sp('metalgreymon_virus', '메탈그레이몬(청)', 'perfect', 'virus');
  sp('blackweregarurumon', '워가루몬(흑)', 'perfect', 'virus');
  sp('deathmeramon', '데드메라몬', 'perfect', 'virus');
  sp('lavogaritamon', '라보가리타몬', 'perfect', 'virus');
  sp('volcamon', '볼케몬', 'perfect', 'virus');
  sp('mametyramon', '콩알티라몬', 'perfect', 'virus');
  sp('metalgreymon2010', '메탈그레이몬(2010)', 'perfect', 'virus');
  sp('groundramon', '그라운드라몬', 'perfect', 'virus');
  sp('frozomon', '프로조몬', 'perfect', 'free');
  sp('daipenmon', '왕펭귄몬', 'perfect', 'free');
  // 야생 — 궁극체
  sp('heavyleomon', '헤비레오몬', 'ultimate', 'vaccine');
  sp('bloomlordmon', '블룸로드몬', 'ultimate', 'vaccine');
  sp('marsmon', '마르스몬', 'ultimate', 'vaccine');
  sp('hexeblaumon', '헥세블라우몬', 'ultimate', 'vaccine');
  sp('victorygreymon', '빅토리그레이몬', 'ultimate', 'vaccine');
  sp('neptunemon', '넵튠몬', 'ultimate', 'vaccine');
  sp('grandlocomon', '그랜드로코몬', 'ultimate', 'data');
  sp('plesiomon', '플레시오몬', 'ultimate', 'data');
  sp('dinorexmon', '다이노렉스몬', 'ultimate', 'data');
  sp('frosvelgrmon', '프로스벨그르몬', 'ultimate', 'data');
  sp('zdgarurumon', '지드가루몬', 'ultimate', 'data');
  sp('cannondramon', '캐논드라몬', 'ultimate', 'data');
  sp('volcanicdramon', '볼케닉드라몬', 'ultimate', 'data');
  sp('pharaohmon', '파라오몬', 'ultimate', 'virus');
  sp('noblepumpmon', '노블펌프몬', 'ultimate', 'virus');
  sp('beelzemon', '베르제브몬', 'ultimate', 'virus');
  sp('skullmammothmon', '스컬맘몬', 'ultimate', 'virus');
  sp('gaioumon', '가이오몬', 'ultimate', 'virus');
  // 보스 · 전설
  sp('myotismon', '묘티스몬', 'perfect', 'virus', { boss: true });
  sp('triceramon', '트리케라몬', 'perfect', 'data', { boss: true });
  sp('piemon', '피에몬', 'ultimate', 'virus', { boss: true });
  sp('mugendramon', '파워드라몬', 'ultimate', 'virus', { boss: true });
  sp('blackwargreymon', '블랙워그레이몬', 'ultimate', 'virus', { boss: true });
  sp('neomyotismon', '네오묘티스몬', 'ultimate', 'virus', { boss: true });
  sp('omegamon_zwart', '오메가몬 즈왈트', 'ultimate', 'virus', { boss: true });
  sp('ancientvolcamon', '에인션트볼카몬', 'ultimate', 'free', { legend: true });
  sp('ancientmegatheriumon', '에인션트메가테리움몬', 'ultimate', 'free', { legend: true });

  /* 진화 조건 (기획안 번호). 엔진이 키로 판정하고, 화면은 hint 를 도감에 보여 준다. */
  var RULE_HINTS = {
    r1: '케어 실수 0–3, 훈련 16–47',
    r2: '다른 조건에 맞지 않을 때',
    r3: '케어 실수 6 이상',
    r4: '위생 실수 4 이상 또는 과식 6 이상',
    r34: '케어 실수 6 이상, 또는 위생 실수 4 이상, 또는 과식 6 이상',
    r12: '수면 방해 4 이상',
    r5: '케어 실수 2 이하, 배틀 15 이상, 승률 60% 이상',
    r6: '훈련 48 이상, 배고픈 채 배틀 5 이상',
    r7: '케어 실수 2 이하, 배틀 15 이상, 승률 80% 이상',
    r8: '케어 실수 0, 배틀 15 이상, 승률 40% 이상',
    r13: '케어 실수 2 이하, 배틀 15 이상, 승률 60% 이상 (정화)',
    r14: '정화 조건에 못 미칠 때',
    r18: '파일드라몬 조건에 못 미칠 때',
    r20: '케어 실수 3–5, 배틀 15 이상, 승률 60% 이상',
    r9: '케어 실수 1 이하, 승률 70% 이상, 보스 격파 1 이상',
    r11: '5연패, 케어 실수 3 이상',
    r15: '케어 실수 1 이하, 승률 70% 이상, 보스 격파 1 이상, 수면 방해 0',
    r10: '짝(워그레이몬·메탈가루몬)을 키워 본 적 있고, 보스 3번 격파',
    r19: '보스 3번 격파',
    flame: '용기의 디지멘탈', thunder: '우정의 디지멘탈', archer: '사랑의 디지멘탈', miracle: '기적의 디지멘탈'
  };
  // 진화 종류 (연출 문구·어둡게 예고에 쓴다)
  var RULE_KIND = {
    r1: 'normal', r2: 'mid', r3: 'bad', r4: 'bad', r34: 'bad', r12: 'dark',
    r5: 'normal', r6: 'dark', r7: 'hidden', r8: 'hidden', r13: 'purify', r14: 'dark', r18: 'mid', r20: 'mid',
    r9: 'normal', r11: 'dark', r15: 'hidden', r10: 'jogress', r19: 'mode'
  };

  /* 스타터 라인
   *   egg      디지타마 무늬 (바탕색, 무늬색, 무늬 모양)
   *   evo[종] = [[조건, 다음 종], ...] — 앞에 있는 것부터 본다 (우선순위)
   *   special  궁극체에서 보스 격파로 일어나는 진화 (⑩ ⑲)
   *   armor    디지멘탈 → 아머체 (성장기 브이몬)
   */
  var LINES = {
    agumon: {
      name: '아구몬', egg: { base: '#fff3dc', mark: '#f08a24', pattern: 'zigzag' }, trait: '밸런스형, 진화 분기가 가장 많음',
      baby1: 'botamon', baby2: 'koromon', child: 'agumon',
      evo: {
        agumon: [['r4', 'coelamon'], ['r3', 'algomon_adult'], ['r1', 'greymon'], ['r2', 'ogremon']],
        greymon: [['r6', 'skullgreymon'], ['r5', 'metalgreymon'], ['r20', 'metaltyranomon']],
        ogremon: [['r7', 'mamemon'], ['r5', 'andromon']],
        algomon_adult: [['r8', 'neodevimon']],
        coelamon: [['r5', 'anomalocarimon']],
        metalgreymon: [['r9', 'wargreymon']],
        metaltyranomon: [['r11', 'blitzgreymon']],
        neodevimon: [['r9', 'donedevimon']]
      },
      special: { wargreymon: { rule: 'r10', to: 'omegamon', partner: 'metalgarurumon' } }
    },
    gabumon: {
      name: '파피몬', egg: { base: '#eef6ff', mark: '#4f8fd8', pattern: 'stripes' }, trait: '수면 관리가 중요, 정화 루트 있음',
      baby1: 'punimon', baby2: 'tsunomon', child: 'gabumon',
      evo: {
        gabumon: [['r34', 'algomon_adult'], ['r12', 'dokugumon'], ['r1', 'garurumon'], ['r2', 'gorimon']],
        garurumon: [['r6', 'parrotmon'], ['r5', 'weregarurumon']],
        dokugumon: [['r13', 'weregarurumon'], ['r14', 'waruseadramon']],
        gorimon: [['r7', 'bigmamemon'], ['r5', 'valvemon']],
        algomon_adult: [['r8', 'orochimon']],
        weregarurumon: [['r15', 'cresgarurumon'], ['r9', 'metalgarurumon']],
        waruseadramon: [['r9', 'nidhoggmon']]
      },
      special: { metalgarurumon: { rule: 'r10', to: 'omegamon', partner: 'wargreymon' } }
    },
    veemon: {
      name: '브이몬', egg: { base: '#f4f6ff', mark: '#2f5fd0', pattern: 'spots' }, trait: '아이템 활용형, 디지멘탈로 아머진화',
      baby1: 'chicomon', baby2: 'chibimon', child: 'veemon',
      evo: {
        veemon: [['r34', 'digitamamon'], ['r1', 'exveemon'], ['r2', 'veedramon']],
        exveemon: [['r5', 'paildramon'], ['r18', 'dinobeemon']],
        veedramon: [['r7', 'goldveedramon'], ['r5', 'aeroveedramon']],
        paildramon: [['r9', 'imperialdramon_dm']],
        aeroveedramon: [['r9', 'ulforceveedramon']]
      },
      special: { imperialdramon_dm: { rule: 'r19', to: 'imperialdramon' } },
      armor: { flame: 'flamedramon', thunder: 'raidramon', archer: 'sagittarimon', miracle: 'magnamon' }
    }
  };
  var LINE_ORDER = ['agumon', 'gabumon', 'veemon'];
  var DIGIMENTALS = ['flame', 'thunder', 'archer', 'miracle'];

  /* 야생 디지몬 풀 [단계][속성] */
  var WILD = {
    child: {
      vaccine: ['pulsemon', 'vorvomon'],
      data: ['palmon', 'sangomon', 'sunarizamon', 'blucomon'],
      virus: ['hagurumon', 'ghostmon', 'blackagumon', 'blackgabumon']
    },
    adult: {
      vaccine: ['birdramon', 'yukidarumon', 'bulkmon', 'tortamon', 'vermillimon', 'tobiumon'],
      data: ['tyranomon', 'seadramon', 'shellmon', 'sunflowmon', 'togemon', 'monochromon', 'ballistamon', 'wizarmon', 'paledramon'],
      virus: ['lavorvomon', 'hyogamon', 'raremon', 'vegiemon', 'octomon', 'golemon', 'bakemon', 'devimon',
        'saberdramon', 'darktyranomon', 'greymon_blue', 'blackgarurumon'],
      free: ['digmon', 'machmon', 'namakemon', 'moosemon', 'rhinomon']
    },
    perfect: {
      vaccine: ['loaderleomon', 'gusokumon', 'panjyamon', 'mammothmon', 'mastertyranomon', 'cyberdramon'],
      data: ['locomon', 'atlurballistamon', 'metalmamemon', 'lilimon', 'mermaimon', 'cryspaledramon', 'flaremon',
        'mailbirdramon', 'jaegerdorulumon', 'crescemon', 'pandamon', 'pumpmon'],
      virus: ['rebellimon', 'arukenimon', 'dagomon', 'vulturemon', 'mummymon', 'jokermon', 'phantomon', 'baalmon',
        'metalgreymon_virus', 'blackweregarurumon', 'deathmeramon', 'lavogaritamon', 'volcamon', 'mametyramon',
        'metalgreymon2010', 'groundramon'],
      free: ['frozomon', 'daipenmon']
    },
    ultimate: {
      vaccine: ['heavyleomon', 'bloomlordmon', 'marsmon', 'hexeblaumon', 'victorygreymon', 'neptunemon'],
      data: ['grandlocomon', 'plesiomon', 'dinorexmon', 'frosvelgrmon', 'zdgarurumon', 'cannondramon', 'volcanicdramon'],
      virus: ['pharaohmon', 'noblepumpmon', 'beelzemon', 'skullmammothmon', 'gaioumon']
    }
  };
  var BOSSES = {
    perfect: ['myotismon', 'triceramon'],
    ultimate: ['piemon', 'mugendramon', 'blackwargreymon', 'neomyotismon', 'omegamon_zwart']
  };
  var LEGENDS = ['ancientvolcamon', 'ancientmegatheriumon'];

  return {
    STAGES: STAGES, STAGE_NAMES: STAGE_NAMES, ATTR_NAMES: ATTR_NAMES, GRADE_NAMES: GRADE_NAMES, RULES: RULES,
    SPECIES: SPECIES, RULE_HINTS: RULE_HINTS, RULE_KIND: RULE_KIND,
    LINES: LINES, LINE_ORDER: LINE_ORDER, DIGIMENTALS: DIGIMENTALS,
    WILD: WILD, BOSSES: BOSSES, LEGENDS: LEGENDS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DigiData;
