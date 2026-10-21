/* 디지몬 육성 — 기획안의 표를 그대로 옮긴 데이터
 *
 * 수치를 고칠 때는 여기만 바꾸면 된다. 판정 로직은 engine.js 에 있다.
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

  // 기획안 6장: 초기에는 느슨하게 잡고 테스트하면서 조인다. 시간은 모두 실시간.
  var RULES = {
    stageHours: { baby1: 1, baby2: 24, child: 72, adult: 96, perfect: 120 },
    patamonChildHours: 96,
    patamonExtendHours: 24, patamonMaxExtend: 2, patamonTraining: 24,
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
    rescueHours: 24,
    previewHours: 24,          // 잘못된 진화가 오기 이만큼 전부터 색이 어두워진다
    scansPerDay: 5,
    hpMax: 100,
    stagePower: { child: 10, adult: 20, perfect: 34, ultimate: 52 },
    gradePower: { normal: 1, rare: 1.2, boss: 1.45 },
    gradeOdds: { normal: 0.70, rare: 0.25, boss: 0.05 },
    ignoreChance: 0.35         // 메기드라몬이 명령을 무시할 확률
  };

  /* 종 정보
   *   mult     전투력 배율 (스컬그레이몬·데블몬·몬자에몬은 궁극체 대신 높게 준다)
   *   terminal 더 진화하지 않는다
   *   boss     야생 보스
   */
  var SPECIES = {};
  function sp(id, name, stage, attr, color, extra) {
    var o = { id: id, name: name, stage: stage, attr: attr, color: color, mult: 1 };
    for (var k in extra || {}) o[k] = extra[k];
    SPECIES[id] = o;
  }

  // 아구몬 라인 (어드벤처)
  sp('botamon', '보타몬', 'baby1', 'free', '#4a4a52');
  sp('koromon', '코로몬', 'baby2', 'free', '#f07a9a');
  sp('agumon', '아구몬', 'child', 'vaccine', '#f2a33a');
  sp('greymon', '그레이몬', 'adult', 'vaccine', '#f08a24');
  sp('metalgreymon', '메탈그레이몬', 'perfect', 'vaccine', '#d9733a');
  sp('wargreymon', '워그레이몬', 'ultimate', 'vaccine', '#f5c242');
  sp('skullgreymon', '스컬그레이몬', 'perfect', 'virus', '#d8d2c4', { mult: 1.3, terminal: true });

  // 가브몬 라인 (어드벤처)
  sp('punimon', '푸니몬', 'baby1', 'free', '#e05a4a');
  sp('tsunomon', '뿔몬', 'baby2', 'free', '#c79a5a');
  sp('gabumon', '가브몬', 'child', 'data', '#e6cf6a');
  sp('garurumon', '가루몬', 'adult', 'data', '#6fa8dc');
  sp('blackgarurumon', '블랙가루몬', 'adult', 'virus', '#3d4250');
  sp('weregarurumon', '웨어가루몬', 'perfect', 'data', '#4a6fa5');
  sp('metalgarurumon', '메탈가루몬', 'ultimate', 'data', '#86b9e8');
  sp('yukidarumon', '유키다루몬', 'adult', 'vaccine', '#e3eef7', { terminal: true });

  // 파닥몬 라인 (어드벤처)
  sp('poyomon', '포요몬', 'baby1', 'free', '#e9edf3');
  sp('tokomon', '토코몬', 'baby2', 'free', '#f3e2c8');
  sp('patamon', '파닥몬', 'child', 'data', '#f0b36a');
  sp('angemon', '엔젤몬', 'adult', 'vaccine', '#f4f1e6');
  sp('holyangemon', '홀리엔젤몬', 'perfect', 'vaccine', '#efe2a8');
  sp('seraphimon', '세라피몬', 'ultimate', 'vaccine', '#e6cf6e');
  sp('unimon', '유니몬', 'adult', 'vaccine', '#e2e2f0', { terminal: true });
  sp('devimon', '데블몬', 'perfect', 'virus', '#4b3a5c', { mult: 1.3, terminal: true });

  // 브이몬 라인 (파워디지몬)
  sp('chicomon', '치코몬', 'baby1', 'free', '#7fb6f0');
  sp('chibimon', '치비몬', 'baby2', 'free', '#4f86e0');
  sp('veemon', '브이몬', 'child', 'free', '#3b6fd8');
  sp('flamedramon', '플레이드라몬', 'adult', 'free', '#e0462e', { armor: true, bossMult: 1.5 });
  sp('exveemon', '엑스브이몬', 'adult', 'free', '#4a7fe0');
  sp('paildramon', '파일드라몬', 'perfect', 'free', '#2f5fb8');
  sp('imperialdramon', '황제드라몬', 'ultimate', 'free', '#2d3f8f');

  // 길몬 라인 (테이머즈)
  sp('jyarimon', '지리몬', 'baby1', 'free', '#e9706a');
  sp('gigimon', '기기몬', 'baby2', 'free', '#e5584a');
  sp('guilmon', '길몬', 'child', 'virus', '#e5482f');
  sp('growlmon', '그라우몬', 'adult', 'virus', '#d63a2a');
  sp('megalogrowlmon', '메가로그라우몬', 'perfect', 'virus', '#b83226');
  sp('dukemon', '듀크몬', 'ultimate', 'vaccine', '#ebe5d2');
  sp('megidramon', '메기드라몬', 'ultimate', 'virus', '#7a1f2b', { mult: 1.35, ignores: true });

  // 임프몬 라인 (테이머즈) — 기획안 이후 추가한 스타터
  sp('zurumon', '즈루몬', 'baby1', 'free', '#5a4a6a');
  sp('yaamon', '야몬', 'baby2', 'free', '#4a3a5a');
  sp('devidramon', '데빌드라몬', 'adult', 'virus', '#3a2a3a');
  sp('astamon', '아스타몬', 'perfect', 'virus', '#5a4a3a');
  sp('beelzemon', '베르제브몬', 'ultimate', 'virus', '#2a2a2a');

  // 공용 중간·실패 루트
  sp('tyranomon', '티라노몬', 'adult', 'data', '#d9583b', { terminal: true });
  sp('darktyranomon', '다크티라노몬', 'adult', 'virus', '#6b3a2e', { terminal: true });
  sp('numemon', '누메몬', 'adult', 'virus', '#9fbf5a');
  sp('monzaemon', '몬자에몬', 'perfect', 'vaccine', '#c98f4a', { mult: 1.3, terminal: true });
  sp('sukamon', '스카몬', 'adult', 'virus', '#c8b84a', { terminal: true });

  // 야생 — 성장기
  sp('piyomon', '피요몬', 'child', 'vaccine', '#f08aa8');
  sp('tentomon', '텐타몬', 'child', 'vaccine', '#c9473a');
  sp('terriermon', '테리어몬', 'child', 'vaccine', '#eef0e2');
  sp('elecmon', '엘레몬', 'child', 'data', '#e04a4a');
  sp('palmon', '팔몬', 'child', 'data', '#7fc65a');
  sp('renamon', '레나몬', 'child', 'data', '#f2c14a');
  sp('goblimon', '고부리몬', 'child', 'virus', '#6aa04a');
  sp('gazimon', '가지몬', 'child', 'virus', '#9a9aa8');
  sp('impmon', '임프몬', 'child', 'virus', '#5a3a6a');
  sp('wormmon', '웜몬', 'child', 'free', '#8fd06a');
  sp('hawkmon', '호크몬', 'child', 'free', '#d0503a');
  sp('armadillomon', '아르마딜로몬', 'child', 'free', '#d6a35a');
  // 야생 — 성숙기
  sp('leomon', '레오몬', 'adult', 'vaccine', '#e8b04a');
  sp('birdramon', '버드라몬', 'adult', 'vaccine', '#f06a2a');
  sp('gargomon', '갈고몬', 'adult', 'vaccine', '#d8dccb');
  sp('seadramon', '세드라몬', 'adult', 'data', '#4aa0d8');
  sp('meramon', '메라몬', 'adult', 'data', '#ff7a2a');
  sp('kyubimon', '쿄우비몬', 'adult', 'data', '#f5d27a');
  sp('ogremon', '오거몬', 'adult', 'virus', '#5a8a4a');
  sp('bakemon', '바케몬', 'adult', 'virus', '#e8e8ee', { terminal: true }); // 임프몬 중간 루트도 겸한다
  sp('kuwagamon', '쿠와가몬', 'adult', 'virus', '#c84040');
  // 야생 — 완전체
  sp('garudamon', '갈다몬', 'perfect', 'vaccine', '#e0603a');
  sp('rapidmon', '래피드몬', 'perfect', 'vaccine', '#5ab05a');
  sp('mamemon', '마메몬', 'perfect', 'data', '#9a8a6a');
  sp('megaseadramon', '메가시드라몬', 'perfect', 'data', '#3a7ac8');
  sp('taomon', '타오몬', 'perfect', 'data', '#f0e0b0');
  sp('etemon', '에테몬', 'perfect', 'virus', '#a8763a');
  sp('arukenimon', '아르케니몬', 'perfect', 'virus', '#c83a5a');
  sp('mummymon', '마미몬', 'perfect', 'virus', '#cfc6a8');
  // 보스 — 대부분 바이러스, 키메라몬만 데이터 (백신 쏠림 견제)
  sp('myotismon', '묘티스몬', 'perfect', 'virus', '#3a2a5a', { boss: true });
  sp('chimeramon', '키메라몬', 'perfect', 'data', '#8a8aa0', { boss: true });
  sp('piemon', '피에몬', 'ultimate', 'virus', '#d8d8e8', { boss: true });
  sp('mugendramon', '무겐드라몬', 'ultimate', 'virus', '#8a8a96', { boss: true });
  sp('blackwargreymon', '블랙워그레이몬', 'ultimate', 'virus', '#3a3a44', { boss: true });
  sp('daemon', '데몬', 'ultimate', 'virus', '#8a1a2a', { boss: true });
  sp('apocalymon', '아포칼리몬', 'ultimate', 'virus', '#5a3a7a', { boss: true });

  /* 스타터 라인. adult/perfect/ultimate 은 정상 루트, mid 는 중간 루트 */
  var LINES = {
    agumon: {
      name: '아구몬', from: '어드벤처', trait: '밸런스형, 진화 분기가 가장 많음',
      baby1: 'botamon', baby2: 'koromon', child: 'agumon',
      adult: 'greymon', perfect: 'metalgreymon', ultimate: 'wargreymon', mid: 'tyranomon'
    },
    gabumon: {
      name: '가브몬', from: '어드벤처', trait: '체력·방어형, 수면 관리가 중요',
      baby1: 'punimon', baby2: 'tsunomon', child: 'gabumon',
      adult: 'garurumon', perfect: 'weregarurumon', ultimate: 'metalgarurumon', mid: 'yukidarumon',
      dark: 'blackgarurumon'
    },
    patamon: {
      name: '파닥몬', from: '어드벤처', trait: '대기만성형, 천사 계열로 진화',
      baby1: 'poyomon', baby2: 'tokomon', child: 'patamon',
      adult: 'angemon', perfect: 'holyangemon', ultimate: 'seraphimon', mid: 'unimon'
    },
    veemon: {
      name: '브이몬', from: '파워디지몬', trait: '아이템 활용형, 아머진화 가능',
      baby1: 'chicomon', baby2: 'chibimon', child: 'veemon',
      adult: 'exveemon', perfect: 'paildramon', ultimate: 'imperialdramon', mid: 'tyranomon',
      armor: 'flamedramon'
    },
    guilmon: {
      name: '길몬', from: '테이머즈', trait: '고위험 고성장형, 폭주 루트 있음',
      baby1: 'jyarimon', baby2: 'gigimon', child: 'guilmon',
      adult: 'growlmon', perfect: 'megalogrowlmon', ultimate: 'dukemon', mid: 'darktyranomon'
    },
    impmon: {
      name: '임프몬', from: '테이머즈', trait: '바이러스 속성 다크형, 상성이 뚜렷함',
      baby1: 'zurumon', baby2: 'yaamon', child: 'impmon',
      adult: 'devidramon', perfect: 'astamon', ultimate: 'beelzemon', mid: 'bakemon'
    }
  };
  var LINE_ORDER = ['agumon', 'gabumon', 'patamon', 'veemon', 'guilmon', 'impmon'];

  /* 야생 디지몬 풀 [단계][속성] */
  var WILD = {
    child: {
      vaccine: ['piyomon', 'tentomon', 'terriermon'],
      data: ['elecmon', 'palmon', 'renamon'],
      virus: ['goblimon', 'gazimon', 'impmon'],
      free: ['wormmon', 'hawkmon', 'armadillomon']
    },
    adult: {
      vaccine: ['leomon', 'birdramon', 'gargomon'],
      data: ['seadramon', 'meramon', 'kyubimon'],
      virus: ['ogremon', 'bakemon', 'kuwagamon', 'darktyranomon']
    },
    perfect: {
      vaccine: ['garudamon', 'rapidmon'],
      data: ['mamemon', 'megaseadramon', 'taomon'],
      virus: ['etemon', 'arukenimon', 'mummymon']
    }
  };
  var BOSSES = {
    perfect: ['myotismon', 'chimeramon'],
    ultimate: ['piemon', 'mugendramon', 'blackwargreymon', 'daemon', 'apocalymon']
  };

  var data = {
    STAGES: STAGES, STAGE_NAMES: STAGE_NAMES, ATTR_NAMES: ATTR_NAMES, RULES: RULES,
    SPECIES: SPECIES, LINES: LINES, LINE_ORDER: LINE_ORDER, WILD: WILD, BOSSES: BOSSES
  };
  return data;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DigiData;
