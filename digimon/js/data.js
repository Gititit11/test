/* 디지몬 육성 — 기획안의 표를 그대로 옮긴 데이터
 *
 * 수치를 고칠 때는 여기만 바꾸면 된다. 판정 로직은 engine.js 에 있다.
 * 이름은 한국 더빙판(나무위키 표기)을 따른다.
 * 브라우저에서는 전역 DigiData, node 에서는 require 로 쓴다.
 */
var DigiData = (function () {
  'use strict';

  var STAGES = ['egg', 'baby1', 'baby2', 'child', 'adult', 'perfect', 'ultimate'];
  var STAGE_NAMES = {
    egg: '디지타마', baby1: '유년기1', baby2: '유년기2', child: '성장기',
    adult: '성숙기', perfect: '완전체', ultimate: '궁극체'
  };
  var ATTR_NAMES = { vaccine: '백신', data: '데이터', virus: '바이러스', free: '프리' };
  var GRADE_NAMES = { normal: '일반', rare: '희귀', boss: '보스', legend: '전설' };

  // 시간은 모두 실시간. 초기에는 느슨하게 잡고 해 보면서 조인다.
  var RULES = {
    eggMinutes: 5,             // 디지타마가 흔들리다가 부화할 때까지 (마지막 1분은 금이 간다)
    stageHours: { baby1: 1, baby2: 24, child: 72, adult: 96, perfect: 120 },
    // 수명은 없다. 한 번 키운 디지몬은 사라지지 않는다.
    failDelayHours: 24,        // 성숙기 → 완전체 진화 실패 때 다음 판정이 이만큼 늦어진다
    callMinutes: 20,           // 배고픔·힘 호출을 이만큼 넘게 두면 케어 실수 (원조 기기와 같음)
    poopLimitMinutes: 180,     // 배변을 이만큼 넘게 두면 위생 실수
    sleepLightsMinutes: 30,    // 잠든 뒤 불을 이만큼 넘게 안 끄면 수면 방해
    wakeMinutes: 10,           // 깨우면 이만큼 깨어 있다가 다시 잔다
    // 배고픔·힘이 1칸 줄어드는 간격(분). 원조 기기처럼 둘이 같은 간격으로 준다.
    hungerEvery: { baby1: 3, baby2: 30, child: 48, adult: 50, perfect: 60, ultimate: 60 },
    strengthEvery: { baby1: 3, baby2: 30, child: 48, adult: 50, perfect: 60, ultimate: 60 },
    poopEvery: { baby1: 20, baby2: 120, child: 180, adult: 180, perfect: 200, ultimate: 220 },
    maxPoops: 8,
    sickPoops: 4,              // 똥이 이만큼 쌓이면 병에 걸린다
    injuryChance: 0.2,         // 배틀에서 지면 이 확률로 다친다 (아픈 것과 같다)
    sickMistakeMinutes: 60,    // 아픈 채로 이만큼 둘 때마다 케어 실수 1 (약 한 번이면 낫는다)
    // [잠드는 시, 깨는 시] (기기 현지 시각). 유년기1 은 한 시간뿐이라 자지 않는다. 나머지는 모두 밤 10시 ~ 아침 8시
    sleep: { baby1: null, baby2: [22, 8], child: [22, 8], adult: [22, 8], perfect: [22, 8], ultimate: [22, 8] },
    armorHours: 48,
    previewHours: 24,          // 잘못된 진화가 오기 이만큼 전부터 색이 어두워진다
    jogressBossWins: 3,        // ⑩ ⑲ 에 필요한 보스 격파 수
    slots: 6,                  // 한 번에 데리고 있을 수 있는 디지몬 (키우는 하나 + 보관함)
    scansPerDay: 5,            // 디지몬마다 하루 배틀 횟수 (바코드 찍기는 무제한). 0 이면 배틀도 무제한 (테스트용)
    hpMax: 100,
    stagePower: { child: 10, adult: 20, perfect: 34, ultimate: 52 },
    gradePower: { normal: 1, rare: 1.2, boss: 1.45, legend: 1.8 },
    // 내 단계 → 나오는 야생 디지몬의 단계 확률. 바코드마다 단계별 디지몬이 정해져 있고,
    // 바코드의 고정된 값이 이 표의 어느 칸에 떨어지느냐로 그중 하나가 나온다.
    // 위 줄로 갈수록 누적 확률이 작아져서, 내가 진화하면 같은 바코드에서 같거나 더 높은 단계가 나온다.
    stageOdds: {
      child: { child: 0.65, adult: 0.30, perfect: 0.05, ultimate: 0 },
      adult: { child: 0.25, adult: 0.50, perfect: 0.22, ultimate: 0.03 },
      perfect: { child: 0.05, adult: 0.30, perfect: 0.50, ultimate: 0.15 },
      ultimate: { child: 0.05, adult: 0.30, perfect: 0.45, ultimate: 0.20 }
    },
    // 나온 디지몬의 단계별 등급 확률
    gradeOdds: {
      child: { normal: 0.75, rare: 0.25 },
      adult: { normal: 0.75, rare: 0.25 },
      perfect: { normal: 0.67, rare: 0.24, boss: 0.09 },
      ultimate: { normal: 0.695, rare: 0.24, boss: 0.05, legend: 0.015 }
    },
    attrOdds: { vaccine: 0.3, data: 0.3, virus: 0.3, free: 0.1 },
    ignoreChance: 0.35,        // 블리츠그레이몬이 명령을 무시할 확률
    // 배틀: 공격 > 필살기 > 방어 > 공격. 표는 [내 커맨드][상대 커맨드] → 내가 넣는 피해 배율
    hitMult: {
      attack: { attack: 1, guard: 0.2, special: 1 },      // 방어에 막히면 0.2 · 필살기는 끊는다
      guard: { attack: 0.6, guard: 0, special: 0 },       // 공격을 막으면 0.6 반격 · 필살기에는 뚫린다
      special: { attack: 0.54, guard: 1.8, special: 1.8 } // 공격에 끊기면 30%(0.54) · 방어를 뚫는다
    },
    gaugeMax: 3,               // 필살기 게이지. 공격 +1, 방어 +1 (공격을 막아내면 +2), 필살기는 가득 차야 쓰고 0 이 된다
    // 상대: foeRead 확률로 내 최근 3턴 습관을 읽고 거기에 가장 센 수를 낸다. 아니면 아래 기본 확률.
    foeRead: 0.6,
    foePrior: 0.2,             // 습관을 모를 때의 짐작 (작을수록 빨리 읽힌다)
    foeFull: { special: 0.34, attack: 0.33, guard: 0.33 },
    foeCharging: { attack: 0.5, guard: 0.5 },
    // 훈련 레벨: 훈련을 성공(3번 중 2번 이상)할 때마다 쌓이고 진화해도 남는다. 16번마다 1레벨, 레벨마다 전투력 +3%
    trainLvEvery: 16,
    trainLvMax: 10,
    trainLvPower: 0.03
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

  var END = { terminal: true, mult: 1.3 };
  var ARMOR = { armor: true, bossMult: 1.5 };

  // 아구몬 라인 (3 - Agumon EX)
  sp('egg_agumon', '디지타마', 'egg', 'free');
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

  // 파피몬 라인 (4 - Gabumon EX)
  sp('egg_gabumon', '디지타마', 'egg', 'free');
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

  // 브이몬 라인 (2 - Ancient Warriors)
  sp('egg_veemon', '디지타마', 'egg', 'free');
  sp('chicomon', '치코몬', 'baby1', 'free');
  sp('chibimon', '꼬마몬', 'baby2', 'free');
  sp('veemon', '브이몬', 'child', 'free');
  sp('exveemon', '엑스브이몬', 'adult', 'free');
  sp('veedramon', '브이드라몬', 'adult', 'vaccine');
  sp('digitamamon', '디지타몬', 'adult', 'data', END);
  sp('flamedramon', '화염드라몬', 'adult', 'free', ARMOR);
  sp('raidramon', '번개드라몬', 'adult', 'free', ARMOR);
  sp('sagittarimon', '사수몬', 'adult', 'free', ARMOR);
  sp('paildramon', '파일드라몬', 'perfect', 'free');
  sp('dinobeemon', '다이노몬', 'perfect', 'free', END);
  sp('aeroveedramon', '에어로브이드라몬', 'perfect', 'vaccine');
  sp('goldveedramon', '골드브이드라몬', 'perfect', 'vaccine', END);
  sp('magnamon', '매그너몬', 'perfect', 'free', ARMOR);
  sp('ulforceveedramon', '알포스브이드라몬', 'ultimate', 'vaccine');
  sp('imperialdramon_dm', '황제드라몬 드래곤 모드', 'ultimate', 'free');
  sp('imperialdramon', '황제드라몬 파이터 모드', 'ultimate', 'free', { mult: 1.25 });

  // 임프몬 라인 (15 - Impmon GP)
  sp('egg_impmon', '디지타마', 'egg', 'free');
  sp('kiimon', '키몬', 'baby1', 'free');
  sp('yaamon', '야몬', 'baby2', 'free');
  sp('impmon', '임프몬', 'child', 'virus');
  sp('wizarmon', '위자몬', 'adult', 'data');
  sp('bakemon', '고스몬', 'adult', 'virus');
  sp('devimon', '데블몬', 'adult', 'virus');
  sp('raremon', '레어몬', 'adult', 'virus');
  sp('baalmon', '바알몬', 'perfect', 'virus');
  sp('astamon', '아스타몬', 'perfect', 'virus');
  sp('fantomon', '팬텀몬', 'perfect', 'virus');
  sp('skullsatamon', '스컬사탄몬', 'perfect', 'virus');
  sp('beelzebumon', '베르제브몬', 'ultimate', 'virus');
  sp('beelzebumon_2010', '베르제브몬(2010)', 'ultimate', 'virus');
  sp('deathmon', '데스몬', 'ultimate', 'virus');
  sp('beelzebumon_blast', '베르제브몬 블래스트 모드', 'ultimate', 'virus', { mult: 1.25 });

  // 길몬 라인 (24 - Guilmon EX)
  sp('egg_guilmon', '디지타마', 'egg', 'free');
  sp('jyarimon', '쟈리몬', 'baby1', 'free');
  sp('gigimon', '기기몬', 'baby2', 'free');
  sp('guilmon', '길몬', 'child', 'virus');
  sp('growmon', '그라우몬', 'adult', 'virus');
  sp('growmon_orange', '그라우몬(황)', 'adult', 'data');
  sp('siesamon', '시사몬', 'adult', 'data');
  sp('devidramon', '데블드라몬', 'adult', 'virus');
  sp('megalogrowmon', '메가로그라우몬', 'perfect', 'virus');
  sp('megalogrowmon_orange', '메가로그라우몬(황)', 'perfect', 'data');
  sp('mihiramon', '미히라몬', 'perfect', 'data', END);
  sp('sandiramon', '산티라몬', 'perfect', 'data', END);
  sp('vajramon', '바지라몬', 'perfect', 'data', END);
  sp('majiramon', '마지라몬', 'perfect', 'data', END);
  sp('dukemon', '듀크몬', 'ultimate', 'vaccine');
  sp('dukemon_x', '듀크몬X', 'ultimate', 'vaccine');
  sp('megidramon', '메기드라몬', 'ultimate', 'virus');
  sp('dukemon_crimson', '듀크몬 크림슨 모드', 'ultimate', 'vaccine', { mult: 1.25 });

  // 레나몬 라인 (26 - Renamon EX)
  sp('egg_renamon', '디지타마', 'egg', 'free');
  sp('relemon', '레레몬', 'baby1', 'free');
  sp('pokomon', '포코몬', 'baby2', 'free');
  sp('renamon', '레나몬', 'child', 'data');
  sp('kyubimon', '구미호몬', 'adult', 'data');
  sp('youkomon', '요우코몬', 'adult', 'virus');
  sp('lynxmon', '링크스몬', 'adult', 'data');
  sp('icedevimon', '아이스데블몬', 'adult', 'virus');
  sp('taomon', '도사몬', 'perfect', 'data');
  sp('doumon', '도우몬', 'perfect', 'virus');
  sp('kumbhiramon', '굼비라몬', 'perfect', 'virus', END);
  sp('indaramon', '인다라몬', 'perfect', 'virus', END);
  sp('caturamon', '챠츠라몬', 'perfect', 'virus', END);
  sp('parasimon', '파라사이몬', 'perfect', 'virus');
  sp('sakuyamon', '샤크라몬', 'ultimate', 'data');
  sp('sakuyamon_x', '샤크라몬X', 'ultimate', 'data');
  sp('kuzuhamon_miko', '쿠즈하몬 무녀 모드', 'ultimate', 'virus');
  sp('vikaralamon', '비가라몬', 'ultimate', 'virus');

  // 야생 — 성장기
  sp('palmon', '팔몬', 'child', 'data');
  sp('terriermon', '테리어몬', 'child', 'vaccine');
  sp('wormmon', '추추몬', 'child', 'free');
  sp('gazimon', '가지몬', 'child', 'virus');
  sp('hagurumon', '톱니몬', 'child', 'virus');
  sp('gotsumon', '울퉁몬', 'child', 'data');
  sp('bearmon', '베어몬', 'child', 'vaccine');
  sp('monodramon', '모노드라몬', 'child', 'data');
  sp('agumon_black', '아구몬(흑)', 'child', 'virus');
  sp('gabumon_black', '파피몬(흑)', 'child', 'virus');
  sp('pulsemon', '펄스몬', 'child', 'vaccine');
  sp('vorvomon', '보보몬', 'child', 'vaccine');
  sp('sangomon', '산호몬', 'child', 'data');
  sp('sunarizamon', '샌드리자몬', 'child', 'data');
  sp('blucomon', '블루코몬', 'child', 'data');
  sp('ghostmon', '아이고스몬', 'child', 'virus');
  sp('gammamon', '감마몬', 'child', 'data');
  sp('angoramon', '앙고라몬', 'child', 'vaccine');
  sp('jellymon', '젤리몬', 'child', 'data');
  sp('ryudamon', '류우다몬', 'child', 'vaccine');
  sp('liollmon', '레오르몬', 'child', 'data');
  sp('flamon', '화염몬', 'child', 'vaccine');
  sp('strabimon', '스트라비몬', 'child', 'vaccine');
  sp('kokuwamon', '코쿠와몬', 'child', 'vaccine');
  sp('gizamon', '기자몬', 'child', 'virus');

  // 야생 — 성숙기
  sp('birdramon', '버드라몬', 'adult', 'vaccine');
  sp('meramon', '메라몬', 'adult', 'data');
  sp('tyranomon', '티라노몬', 'adult', 'data');
  sp('monochromon', '모노크로몬', 'adult', 'data');
  sp('darktyranomon', '다크티라노몬', 'adult', 'virus');
  sp('greymon_blue', '그레이몬(청)', 'adult', 'virus');
  sp('garurumon_black', '가루몬(흑)', 'adult', 'virus');
  sp('seadramon', '시드라몬', 'adult', 'data');
  sp('shellmon', '쉘몬', 'adult', 'data');
  sp('gesomon', '연체몬', 'adult', 'virus');
  sp('togemon', '니드몬', 'adult', 'data');
  sp('snimon', '스나이몬', 'adult', 'virus');
  sp('sunflowmon', '해바라기몬', 'adult', 'data');
  sp('vegimon', '베지몬', 'adult', 'virus');
  sp('golemon', '록몬', 'adult', 'virus');
  sp('digmon', '디그몬', 'adult', 'free');
  sp('tortamon', '토타몬', 'adult', 'vaccine');
  sp('leomon', '레오몬', 'adult', 'vaccine');
  sp('galgomon', '가고몬', 'adult', 'vaccine');
  sp('stingmon', '스팅몬', 'adult', 'free');
  sp('strikedramon', '스트라이크드라몬', 'adult', 'vaccine');
  sp('saberdramon', '블랙버드라몬', 'adult', 'virus');
  sp('yukidarumon', '프리지몬', 'adult', 'vaccine');
  sp('hyougamon', '블루우가몬', 'adult', 'virus');
  sp('mojyamon', '모털몬', 'adult', 'vaccine');
  sp('gryzmon', '그리즈몬', 'adult', 'vaccine');
  sp('drimogemon', '두리몬', 'adult', 'data');
  sp('dorulumon', '도루루몬', 'adult', 'data');
  sp('rhinomon', '리노몬', 'adult', 'free');
  sp('machmon', '마하몬', 'adult', 'free');
  sp('ballistamon', '바리스타몬', 'adult', 'data');
  sp('moosemon', '무스몬', 'adult', 'free');
  sp('paledramon', '페일드라몬', 'adult', 'data');
  sp('lavorvomon', '라보보몬', 'adult', 'virus');
  sp('tobiumon', '플라잉피쉬몬', 'adult', 'vaccine');
  sp('octmon', '옥토몬', 'adult', 'virus');
  sp('bulkmon', '벌크몬', 'adult', 'vaccine');
  sp('namakemon', '나마케몬', 'adult', 'free');
  sp('parasaurmon', '파라사우몬', 'adult', 'data');
  sp('starmon', '스타몬', 'adult', 'data');
  sp('rukamon', '루카몬', 'adult', 'data');
  sp('turuiemon', '토리에몬', 'adult', 'data');
  sp('wendimon', '웬디몬', 'adult', 'virus');
  sp('shadramon', '샤드라몬', 'adult', 'virus');
  sp('agnimon', '아그니몬', 'adult', 'free');
  sp('wolfmon', '볼프몬', 'adult', 'free');
  sp('fairimon', '페어리몬', 'adult', 'free');
  sp('chackmon', '챠크몬', 'adult', 'free');
  sp('blitzmon', '블리츠몬', 'adult', 'free');
  sp('ginryumon', '긴류몬', 'adult', 'vaccine');

  // 야생 — 완전체
  sp('megaseadramon', '메가시드라몬', 'perfect', 'data');
  sp('lilimon', '릴리몬', 'perfect', 'data');
  sp('blossomon', '브롯사몬', 'perfect', 'data');
  sp('mammon', '맘몬', 'perfect', 'vaccine');
  sp('panjyamon', '화이트레오몬', 'perfect', 'vaccine');
  sp('mastertyranomon', '마스터티라노몬', 'perfect', 'vaccine');
  sp('deathmeramon', '데드메라몬', 'perfect', 'virus');
  sp('metalmamemon', '메탈콩알몬', 'perfect', 'data');
  sp('loaderliomon', '로더레오몬', 'perfect', 'vaccine');
  sp('atlurballistamon', '아트라바리스타몬', 'perfect', 'data');
  sp('locomon', '로코몬', 'perfect', 'data');
  sp('mailbirdramon', '메일버드라몬', 'perfect', 'data');
  sp('rebellimon', '리벨리몬', 'perfect', 'virus');
  sp('metalgreymon_virus', '메탈그레이몬(청)', 'perfect', 'virus');
  sp('metalgreymon_2010', '메탈그레이몬(2010)', 'perfect', 'virus');
  sp('extyranomon', '엑스티라노몬', 'perfect', 'data');
  sp('weregarurumon_black', '워가루몬(흑)', 'perfect', 'virus');
  sp('weregarurumon_sm', '워가루몬 사지타리우스 모드', 'perfect', 'vaccine');
  sp('pandamon', '팬더몬', 'perfect', 'data');
  sp('jaegerdorulumon', '예거도루루몬', 'perfect', 'data');
  sp('cerberumon', '케르베로스몬', 'perfect', 'vaccine');
  sp('rapidmon', '래피드몬', 'perfect', 'vaccine');
  sp('cyberdramon', '사이버드라몬', 'perfect', 'vaccine');
  sp('jokermon', '조커몬', 'perfect', 'virus');
  sp('gusokumon', '기간테우스몬', 'perfect', 'vaccine');
  sp('mermaimon', '인어몬', 'perfect', 'data');
  sp('marinchimairamon', '마린키메라몬', 'perfect', 'virus');
  sp('volcamon', '볼케몬', 'perfect', 'virus');
  sp('lavogaritamon', '라보가리타몬', 'perfect', 'virus');
  sp('groundramon', '그라운드라몬', 'perfect', 'virus');
  sp('flaremon', '플레어몬', 'perfect', 'data');
  sp('cryspaledramon', '크리스페일드라몬', 'perfect', 'data');
  sp('crescemon', '크레세몬', 'perfect', 'data');
  sp('frozomon', '프로조몬', 'perfect', 'free');
  sp('daipenmon', '왕펭귄몬', 'perfect', 'free');
  sp('triceramon', '트리케라몬', 'perfect', 'data');
  sp('vulturemon', '벌처몬', 'perfect', 'virus');
  sp('jewelbeemon', '주엘비몬', 'perfect', 'free');
  sp('pucchiemon', '푸치몬', 'perfect', 'free');
  sp('aldamon', '아루다몬', 'perfect', 'free');
  sp('andiramon', '안티라몬', 'perfect', 'data');
  sp('scorpiomon', '스콜피온몬', 'perfect', 'data');
  sp('asuramon', '아수라몬', 'perfect', 'vaccine');
  sp('kongoumon', '콩고몬', 'perfect', 'free');
  sp('vermillimon', '버밀리몬', 'perfect', 'vaccine');

  // 야생 — 궁극체
  sp('victorygreymon', '빅토리그레이몬', 'ultimate', 'vaccine');
  sp('zekegreymon', '지크그레이몬', 'ultimate', 'vaccine');
  sp('heavyleomon', '헤비레오몬', 'ultimate', 'vaccine');
  sp('grandlocomon', '그랜드로코몬', 'ultimate', 'data');
  sp('bloomlordmon', '블룸로드몬', 'ultimate', 'vaccine');
  sp('marsmon', '마르스몬', 'ultimate', 'vaccine');
  sp('hexblaumon', '헥세블라우몬', 'ultimate', 'vaccine');
  sp('neptunemon', '넵튠몬', 'ultimate', 'vaccine');
  sp('plesiomon', '플레시오몬', 'ultimate', 'data');
  sp('regalecusmon', '레갈레쿠스몬', 'ultimate', 'data');
  sp('dinorexmon', '다이노렉스몬', 'ultimate', 'data');
  sp('frosvelgrmon', '프로스베르그몬', 'ultimate', 'data');
  sp('zdgarurumon', '지드가루몬', 'ultimate', 'data');
  sp('cannondramon', '캐논드라몬', 'ultimate', 'data');
  sp('volcanicdramon', '볼케닉드라몬', 'ultimate', 'data');
  sp('pharaohmon', '파라오몬', 'ultimate', 'virus');
  sp('noblepumpmon', '노블펌프몬', 'ultimate', 'virus');
  sp('skullmammon', '스컬맘몬', 'ultimate', 'virus');
  sp('gaioumon', '가이오몬', 'ultimate', 'virus');
  sp('saintgalgomon', '세인트가르고몬', 'ultimate', 'vaccine');
  sp('cherubimon_virtue', '케루비몬(선)', 'ultimate', 'vaccine');
  sp('justimon', '저스티몬', 'ultimate', 'vaccine');
  sp('metalgarurumon_black', '메탈가루몬(흑)', 'ultimate', 'virus');
  sp('imperialdramon_pm', '황제드라몬 팔라딘 모드', 'ultimate', 'vaccine');
  sp('grankuwagamon', '그랜쿠가몬', 'ultimate', 'virus');
  sp('banchostingmon', '반쵸스팅몬', 'ultimate', 'free');
  sp('kaisergreymon', '카이젤그레이몬', 'ultimate', 'free');
  sp('magnagarurumon', '매그너가루몬', 'ultimate', 'free');
  sp('rafflesimon', '라플레시몬', 'ultimate', 'data');
  sp('hydramon', '히드라몬', 'ultimate', 'virus');

  // 보스 · 전설
  sp('vamdemon', '묘티스몬', 'perfect', 'virus', { boss: true });
  sp('mummymon', '미이라몬', 'perfect', 'virus', { boss: true });
  sp('archnemon', '아라크네몬', 'perfect', 'virus', { boss: true });
  sp('chimairamon', '키메라몬', 'perfect', 'data', { boss: true });
  sp('dagomon', '드라고몬', 'perfect', 'virus', { boss: true });
  sp('marindevimon', '마린데블몬', 'perfect', 'virus', { boss: true });
  sp('pumpmon', '펌프몬', 'perfect', 'virus', { boss: true });
  sp('makuramon', '마쿠라몬', 'perfect', 'data', { boss: true });
  sp('sinduramon', '신드라몬', 'perfect', 'data', { boss: true });
  sp('pajiramon', '파지라몬', 'perfect', 'data', { boss: true });
  sp('duskmon', '더스크몬', 'perfect', 'free', { boss: true });
  sp('mercuremon', '머큐리몬', 'perfect', 'free', { boss: true });
  sp('piemon', '피에몬', 'ultimate', 'virus', { boss: true });
  sp('mugendramon', '파워드라몬', 'ultimate', 'virus', { boss: true });
  sp('metalseadramon', '메탈시드라몬', 'ultimate', 'data', { boss: true });
  sp('venomvamdemon', '베놈묘티스몬', 'ultimate', 'virus', { boss: true });
  sp('neovamdemon', '네오묘티스몬', 'ultimate', 'virus', { boss: true });
  sp('blackwargreymon', '블랙워그레이몬', 'ultimate', 'virus', { boss: true });
  sp('diablomon', '디아블로몬', 'ultimate', 'free', { boss: true });
  sp('cherubimon_vice', '케루비몬(악)', 'ultimate', 'virus', { boss: true });
  sp('lucemon_falldown', '루체몬 폴다운 모드', 'ultimate', 'virus', { boss: true });
  sp('omegamon_zwart', '오메가몬 즈왈트', 'ultimate', 'virus', { boss: true });
  sp('chaosdramon', '카오스드라몬', 'ultimate', 'virus', { boss: true });
  sp('chaosdukemon', '카오스듀크몬', 'ultimate', 'virus', { boss: true });
  sp('gulfmon', '가르프몬', 'ultimate', 'virus', { boss: true });
  sp('jyureimon', '쥬레이몬', 'ultimate', 'virus', { boss: true });
  sp('apocalymon', '아포카리몬', 'ultimate', 'virus', { legend: true });
  sp('millenniumon', '밀레니엄몬', 'ultimate', 'virus', { legend: true });
  sp('reaper', '리퍼', 'ultimate', 'free', { legend: true });
  sp('susanoomon', '스사노오몬', 'ultimate', 'free', { legend: true });

  /* 진화 조건 (기획안 번호). 엔진이 키로 판정하고, 화면은 hint 를 도감에 보여 준다. */
  var RULE_HINTS = {
    r1: '케어 실수 0–3, 훈련 16 이상',
    r21: '케어 실수 0–3, 훈련 48 이상',
    r2: '다른 조건에 맞지 않을 때',
    r3: '케어 실수 6 이상',
    r4: '위생 실수 4 이상 또는 과식 6 이상',
    r34: '케어 실수 6 이상, 또는 위생 실수 4 이상, 또는 과식 6 이상',
    r12: '수면 방해 4 이상',
    r5: '케어 실수 2 이하, 배틀 15 이상, 승률 50% 이상',
    r6: '훈련 48 이상, 배고픈 채 배틀 5 이상',
    r7: '케어 실수 2 이하, 배틀 15 이상, 승률 50% 미만',
    r8: '케어 실수 0, 배틀 15 이상, 승률 40% 이상',
    r13: '케어 실수 2 이하, 배틀 15 이상, 승률 50% 이상 (정화)',
    r14: '정화 조건에 못 미칠 때',
    r18: '파일드라몬 조건에 못 미칠 때',
    r20: '케어 실수 3–5, 배틀 15 이상, 승률 50% 이상',
    r9: '케어 실수 1 이하, 배틀 10 이상, 승률 60% 이상, 보스 격파 1 이상',
    r11: '5연패, 케어 실수 3 이상',
    r15: '케어 실수 1 이하, 배틀 10 이상, 승률 60% 이상, 보스 격파 1 이상, 수면 방해 0',
    r10: '짝(워그레이몬·메탈가루몬)을 키워 본 적 있고, 보스 3번 격파',
    r19: '보스 3번 격파',
    flame: '용기의 디지멘탈', thunder: '우정의 디지멘탈', archer: '사랑의 디지멘탈', miracle: '기적의 디지멘탈'
  };
  // 진화 종류 (연출 문구·어둡게 예고에 쓴다)
  var RULE_KIND = {
    r1: 'normal', r21: 'hidden', r2: 'mid', r3: 'bad', r4: 'bad', r34: 'bad', r12: 'dark',
    r5: 'normal', r6: 'dark', r7: 'mid', r8: 'hidden', r13: 'purify', r14: 'dark', r18: 'mid', r20: 'mid',
    r9: 'normal', r11: 'dark', r15: 'hidden', r10: 'jogress', r19: 'mode'
  };

  /* 스타터 라인
   *   evo[종] = [[조건, 다음 종], ...] — 앞에 있는 것부터 본다 (우선순위)
   *   special  궁극체에서 보스 격파로 일어나는 진화 (⑩ ⑲)
   *   armor    디지멘탈 → 아머체 (성장기 브이몬)
   *   디지타마 그림은 sprites/egg_<라인>.png
   */
  var LINES = {
    agumon: {
      name: '아구몬', trait: '밸런스형, 진화 분기가 가장 많음',
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
      name: '파피몬', trait: '수면 관리가 중요, 정화 루트 있음',
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
      name: '브이몬', trait: '아이템 활용형, 디지멘탈로 아머진화',
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
    },
    impmon: {
      name: '임프몬', trait: '바이러스 다크형, 보스를 이기면 블래스트 모드',
      baby1: 'kiimon', baby2: 'yaamon', child: 'impmon',
      evo: {
        impmon: [['r34', 'raremon'], ['r12', 'devimon'], ['r1', 'wizarmon'], ['r2', 'bakemon']],
        wizarmon: [['r6', 'fantomon'], ['r5', 'baalmon']],
        bakemon: [['r7', 'skullsatamon'], ['r5', 'astamon']],
        devimon: [['r13', 'baalmon'], ['r14', 'skullsatamon']],
        raremon: [['r8', 'fantomon']],
        baalmon: [['r15', 'beelzebumon_2010'], ['r9', 'beelzebumon']],
        astamon: [['r9', 'beelzebumon']],
        fantomon: [['r9', 'deathmon']],
        skullsatamon: [['r11', 'deathmon']]
      },
      special: { beelzebumon: { rule: 'r19', to: 'beelzebumon_blast' } }
    },
    guilmon: {
      name: '길몬', trait: '고위험 고성장형, 데바로 갈라지고 폭주하면 메기드라몬',
      baby1: 'jyarimon', baby2: 'gigimon', child: 'guilmon',
      evo: {
        guilmon: [['r34', 'devidramon'], ['r21', 'growmon_orange'], ['r1', 'growmon'], ['r2', 'siesamon']],
        growmon: [['r5', 'megalogrowmon'], ['r20', 'mihiramon']],
        growmon_orange: [['r7', 'majiramon'], ['r5', 'megalogrowmon_orange']],
        siesamon: [['r7', 'vajramon'], ['r5', 'sandiramon']],
        devidramon: [['r8', 'majiramon']],
        megalogrowmon: [['r11', 'megidramon'], ['r9', 'dukemon']],
        megalogrowmon_orange: [['r15', 'dukemon_x'], ['r9', 'dukemon']]
      },
      special: { dukemon: { rule: 'r19', to: 'dukemon_crimson' } }
    },
    renamon: {
      name: '레나몬', trait: '정화·다크 루트와 데바 분기가 있는 데이터형',
      baby1: 'relemon', baby2: 'pokomon', child: 'renamon',
      evo: {
        renamon: [['r34', 'icedevimon'], ['r12', 'youkomon'], ['r1', 'kyubimon'], ['r2', 'lynxmon']],
        kyubimon: [['r5', 'taomon'], ['r20', 'kumbhiramon']],
        youkomon: [['r13', 'taomon'], ['r14', 'doumon']],
        lynxmon: [['r7', 'caturamon'], ['r5', 'indaramon']],
        icedevimon: [['r8', 'parasimon']],
        taomon: [['r15', 'sakuyamon_x'], ['r9', 'sakuyamon']],
        doumon: [['r9', 'kuzuhamon_miko']],
        parasimon: [['r11', 'vikaralamon']]
      }
    }
  };
  var LINE_ORDER = ['agumon', 'gabumon', 'veemon', 'impmon', 'guilmon', 'renamon'];
  var DIGIMENTALS = ['flame', 'thunder', 'archer', 'miracle'];

  /* 야생 디지몬 풀 [단계][속성] */
  var WILD = {
    child: {
      vaccine: ['terriermon', 'bearmon', 'pulsemon', 'vorvomon', 'angoramon', 'ryudamon', 'flamon', 'strabimon', 'kokuwamon'],
      data: ['palmon', 'gotsumon', 'monodramon', 'sangomon', 'sunarizamon', 'blucomon', 'gammamon', 'jellymon', 'liollmon'],
      virus: ['gazimon', 'hagurumon', 'agumon_black', 'gabumon_black', 'ghostmon', 'gizamon'],
      free: ['wormmon']
    },
    adult: {
      vaccine: ['birdramon', 'tortamon', 'leomon', 'galgomon', 'strikedramon', 'yukidarumon', 'mojyamon', 'gryzmon',
        'tobiumon', 'bulkmon', 'ginryumon'],
      data: ['meramon', 'tyranomon', 'monochromon', 'seadramon', 'shellmon', 'togemon', 'sunflowmon', 'drimogemon',
        'dorulumon', 'ballistamon', 'paledramon', 'parasaurmon', 'starmon', 'rukamon', 'turuiemon'],
      virus: ['darktyranomon', 'greymon_blue', 'garurumon_black', 'gesomon', 'snimon', 'vegimon', 'golemon',
        'saberdramon', 'hyougamon', 'lavorvomon', 'octmon', 'wendimon', 'shadramon'],
      free: ['digmon', 'stingmon', 'rhinomon', 'machmon', 'moosemon', 'namakemon', 'agnimon', 'wolfmon', 'fairimon',
        'chackmon', 'blitzmon']
    },
    perfect: {
      vaccine: ['mammon', 'panjyamon', 'mastertyranomon', 'loaderliomon', 'weregarurumon_sm', 'cerberumon', 'rapidmon',
        'cyberdramon', 'gusokumon', 'asuramon', 'vermillimon'],
      data: ['megaseadramon', 'lilimon', 'blossomon', 'metalmamemon', 'atlurballistamon', 'locomon', 'mailbirdramon',
        'extyranomon', 'pandamon', 'jaegerdorulumon', 'mermaimon', 'flaremon', 'cryspaledramon', 'crescemon',
        'triceramon', 'andiramon', 'scorpiomon'],
      virus: ['deathmeramon', 'rebellimon', 'metalgreymon_virus', 'metalgreymon_2010', 'weregarurumon_black', 'jokermon',
        'marinchimairamon', 'volcamon', 'lavogaritamon', 'groundramon', 'vulturemon'],
      free: ['frozomon', 'daipenmon', 'jewelbeemon', 'pucchiemon', 'aldamon', 'kongoumon']
    },
    ultimate: {
      vaccine: ['victorygreymon', 'zekegreymon', 'heavyleomon', 'bloomlordmon', 'marsmon', 'hexblaumon', 'neptunemon',
        'saintgalgomon', 'cherubimon_virtue', 'justimon', 'imperialdramon_pm'],
      data: ['grandlocomon', 'plesiomon', 'regalecusmon', 'dinorexmon', 'frosvelgrmon', 'zdgarurumon', 'cannondramon',
        'volcanicdramon', 'rafflesimon'],
      virus: ['pharaohmon', 'noblepumpmon', 'skullmammon', 'gaioumon', 'metalgarurumon_black', 'grankuwagamon', 'hydramon'],
      free: ['banchostingmon', 'kaisergreymon', 'magnagarurumon']
    }
  };
  var BOSSES = {
    perfect: ['vamdemon', 'mummymon', 'archnemon', 'chimairamon', 'dagomon', 'marindevimon', 'pumpmon', 'makuramon',
      'sinduramon', 'pajiramon', 'duskmon', 'mercuremon'],
    ultimate: ['piemon', 'mugendramon', 'metalseadramon', 'venomvamdemon', 'neovamdemon', 'blackwargreymon', 'diablomon',
      'cherubimon_vice', 'lucemon_falldown', 'omegamon_zwart', 'chaosdramon', 'chaosdukemon', 'gulfmon', 'jyureimon']
  };
  var LEGENDS = ['apocalymon', 'millenniumon', 'reaper', 'susanoomon'];

  return {
    STAGES: STAGES, STAGE_NAMES: STAGE_NAMES, ATTR_NAMES: ATTR_NAMES, GRADE_NAMES: GRADE_NAMES, RULES: RULES,
    SPECIES: SPECIES, RULE_HINTS: RULE_HINTS, RULE_KIND: RULE_KIND,
    LINES: LINES, LINE_ORDER: LINE_ORDER, DIGIMENTALS: DIGIMENTALS,
    WILD: WILD, BOSSES: BOSSES, LEGENDS: LEGENDS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DigiData;
