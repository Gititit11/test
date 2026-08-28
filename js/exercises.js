/* 내장 운동 데이터베이스
 * 형식: [이름, 영문명, 부위, 장비, 주동근(쉼표), 검색태그, 타입]
 * 타입: 'reps'(기본, 횟수) | 'time'(시간)
 */
(function (global) {
  'use strict';

  var PARTS = ['가슴', '등', '어깨', '팔', '하체', '코어', '유산소'];
  var EQUIPS = ['머신', '케이블', '바벨', '덤벨', '스미스', '맨몸', '기타'];

  var RAW = [
    // ── 가슴 ─────────────────────────────────────────────
    ['벤치프레스', 'Barbell Bench Press', '가슴', '바벨', '대흉근,삼두,전면삼각', 'benchpress 벤프'],
    ['인클라인 벤치프레스', 'Incline Barbell Bench Press', '가슴', '바벨', '상부 대흉근,전면삼각', 'incline 인클'],
    ['디클라인 벤치프레스', 'Decline Barbell Bench Press', '가슴', '바벨', '하부 대흉근,삼두', 'decline'],
    ['클로즈그립 벤치프레스', 'Close Grip Bench Press', '팔', '바벨', '삼두,대흉근', 'closegrip 클그벤'],
    ['덤벨 벤치프레스', 'Dumbbell Bench Press', '가슴', '덤벨', '대흉근,삼두', 'db press 덤벤'],
    ['인클라인 덤벨 프레스', 'Incline Dumbbell Press', '가슴', '덤벨', '상부 대흉근', 'incline db 인덤프'],
    ['디클라인 덤벨 프레스', 'Decline Dumbbell Press', '가슴', '덤벨', '하부 대흉근', ''],
    ['덤벨 플라이', 'Dumbbell Fly', '가슴', '덤벨', '대흉근', 'fly 플라이'],
    ['인클라인 덤벨 플라이', 'Incline Dumbbell Fly', '가슴', '덤벨', '상부 대흉근', ''],
    ['체스트 프레스 머신', 'Chest Press Machine', '가슴', '머신', '대흉근,삼두', 'chestpress 체프'],
    ['인클라인 체스트 프레스 머신', 'Incline Chest Press Machine', '가슴', '머신', '상부 대흉근', ''],
    ['디클라인 체스트 프레스 머신', 'Decline Chest Press Machine', '가슴', '머신', '하부 대흉근', ''],
    ['펙덱 플라이 머신', 'Pec Deck Fly', '가슴', '머신', '대흉근', 'pecdeck 버터플라이'],
    ['케이블 크로스오버', 'Cable Crossover', '가슴', '케이블', '대흉근', 'crossover 크로스'],
    ['로우 케이블 플라이', 'Low Cable Fly', '가슴', '케이블', '상부 대흉근', ''],
    ['하이 케이블 플라이', 'High Cable Fly', '가슴', '케이블', '하부 대흉근', ''],
    ['스미스머신 벤치프레스', 'Smith Machine Bench Press', '가슴', '스미스', '대흉근,삼두', 'smith'],
    ['딥스 (가슴)', 'Chest Dip', '가슴', '맨몸', '하부 대흉근,삼두', 'dips 딥스'],
    ['푸시업', 'Push Up', '가슴', '맨몸', '대흉근,삼두,코어', 'pushup 팔굽혀펴기'],
    ['와이드 푸시업', 'Wide Push Up', '가슴', '맨몸', '대흉근', ''],
    ['덤벨 풀오버', 'Dumbbell Pullover', '가슴', '덤벨', '대흉근,광배근', 'pullover'],

    // ── 등 ───────────────────────────────────────────────
    ['데드리프트', 'Conventional Deadlift', '등', '바벨', '척추기립근,광배근,햄스트링,둔근', 'deadlift 데드'],
    ['루마니안 데드리프트', 'Romanian Deadlift', '하체', '바벨', '햄스트링,둔근,척추기립근', 'rdl 루데'],
    ['스모 데드리프트', 'Sumo Deadlift', '등', '바벨', '둔근,내전근,척추기립근', 'sumo'],
    ['바벨 로우', 'Bent Over Barbell Row', '등', '바벨', '광배근,능형근,후면삼각', 'barbellrow 바로우'],
    ['펜들레이 로우', 'Pendlay Row', '등', '바벨', '광배근,능형근', 'pendlay'],
    ['티바 로우', 'T-Bar Row', '등', '머신', '광배근,능형근', 'tbar 티바'],
    ['덤벨 원암 로우', 'One Arm Dumbbell Row', '등', '덤벨', '광배근,능형근', 'dbrow 원암'],
    ['시티드 케이블 로우', 'Seated Cable Row', '등', '케이블', '광배근,능형근', 'cablerow 시티드로우'],
    ['랫 풀다운', 'Lat Pulldown', '등', '머신', '광배근,대원근', 'latpulldown 랫풀'],
    ['클로즈그립 랫풀다운', 'Close Grip Lat Pulldown', '등', '머신', '광배근', ''],
    ['리버스그립 랫풀다운', 'Reverse Grip Lat Pulldown', '등', '머신', '광배근,이두', ''],
    ['시티드 로우 머신', 'Seated Row Machine', '등', '머신', '광배근,능형근', ''],
    ['하이 로우 머신', 'Iso-Lateral High Row', '등', '머신', '광배근,능형근', 'highrow'],
    ['풀업', 'Pull Up', '등', '맨몸', '광배근,대원근', 'pullup 턱걸이'],
    ['친업', 'Chin Up', '등', '맨몸', '광배근,이두', 'chinup'],
    ['어시스트 풀업 머신', 'Assisted Pull Up Machine', '등', '머신', '광배근', 'assist'],
    ['스트레이트암 풀다운', 'Straight Arm Pulldown', '등', '케이블', '광배근', ''],
    ['바벨 슈러그', 'Barbell Shrug', '등', '바벨', '승모근', 'shrug 슈러그'],
    ['덤벨 슈러그', 'Dumbbell Shrug', '등', '덤벨', '승모근', ''],
    ['백 익스텐션', 'Back Extension', '등', '맨몸', '척추기립근,둔근', '허리 백익'],
    ['굿모닝', 'Good Morning', '등', '바벨', '척추기립근,햄스트링', 'goodmorning'],

    // ── 어깨 ─────────────────────────────────────────────
    ['오버헤드 프레스', 'Overhead Press', '어깨', '바벨', '전면삼각,삼두', 'ohp 밀프'],
    ['비하인드넥 프레스', 'Behind The Neck Press', '어깨', '바벨', '측면삼각,전면삼각', ''],
    ['덤벨 숄더 프레스', 'Dumbbell Shoulder Press', '어깨', '덤벨', '전면삼각,측면삼각', '숄프'],
    ['아놀드 프레스', 'Arnold Press', '어깨', '덤벨', '전면삼각,측면삼각', 'arnold'],
    ['숄더 프레스 머신', 'Shoulder Press Machine', '어깨', '머신', '전면삼각,측면삼각', ''],
    ['사이드 레터럴 레이즈', 'Dumbbell Lateral Raise', '어깨', '덤벨', '측면삼각', 'lateralraise 사레레'],
    ['케이블 레터럴 레이즈', 'Cable Lateral Raise', '어깨', '케이블', '측면삼각', ''],
    ['레터럴 레이즈 머신', 'Lateral Raise Machine', '어깨', '머신', '측면삼각', ''],
    ['프론트 레이즈', 'Front Raise', '어깨', '덤벨', '전면삼각', 'frontraise'],
    ['벤트오버 리어델트 레이즈', 'Bent Over Rear Delt Raise', '어깨', '덤벨', '후면삼각', '리어델트'],
    ['리버스 펙덱', 'Reverse Pec Deck', '어깨', '머신', '후면삼각,능형근', '리버스 펙덱'],
    ['페이스 풀', 'Face Pull', '어깨', '케이블', '후면삼각,회전근개', 'facepull 페풀'],
    ['업라이트 로우', 'Upright Row', '어깨', '바벨', '측면삼각,승모근', ''],

    // ── 팔 ───────────────────────────────────────────────
    ['바벨 컬', 'Barbell Curl', '팔', '바벨', '이두', 'curl 바컬'],
    ['EZ바 컬', 'EZ Bar Curl', '팔', '바벨', '이두', 'ezbar'],
    ['덤벨 컬', 'Dumbbell Curl', '팔', '덤벨', '이두', 'dbcurl 덤컬'],
    ['해머 컬', 'Hammer Curl', '팔', '덤벨', '이두,상완요골근', 'hammer 해머'],
    ['인클라인 덤벨 컬', 'Incline Dumbbell Curl', '팔', '덤벨', '이두 장두', ''],
    ['컨센트레이션 컬', 'Concentration Curl', '팔', '덤벨', '이두', ''],
    ['프리처 컬', 'Preacher Curl', '팔', '머신', '이두 단두', 'preacher 프리처'],
    ['케이블 컬', 'Cable Curl', '팔', '케이블', '이두', ''],
    ['리버스 컬', 'Reverse Curl', '팔', '바벨', '상완요골근,전완', ''],
    ['케이블 푸시다운', 'Triceps Pushdown', '팔', '케이블', '삼두', 'pushdown 푸시다운'],
    ['로프 푸시다운', 'Rope Pushdown', '팔', '케이블', '삼두 외측두', 'rope'],
    ['라잉 트라이셉스 익스텐션', 'Skull Crusher', '팔', '바벨', '삼두 장두', 'skullcrusher 스컬크러셔'],
    ['오버헤드 덤벨 익스텐션', 'Overhead Dumbbell Extension', '팔', '덤벨', '삼두 장두', ''],
    ['케이블 오버헤드 익스텐션', 'Cable Overhead Triceps Extension', '팔', '케이블', '삼두 장두', 'overhead 오버헤드 케오버'],
    ['트라이셉스 익스텐션 머신', 'Triceps Extension Machine', '팔', '머신', '삼두', ''],
    ['딥스 (삼두)', 'Triceps Dip', '팔', '맨몸', '삼두,대흉근', ''],
    ['덤벨 킥백', 'Dumbbell Kickback', '팔', '덤벨', '삼두', 'kickback'],
    ['리스트 컬', 'Wrist Curl', '팔', '바벨', '전완', '전완'],
    ['리버스 리스트 컬', 'Reverse Wrist Curl', '팔', '바벨', '전완', ''],
    ['파머스 워크', 'Farmers Walk', '팔', '덤벨', '전완,승모근,코어', 'farmers', 'time'],

    // ── 하체 ─────────────────────────────────────────────
    ['백 스쿼트', 'Barbell Back Squat', '하체', '바벨', '대퇴사두,둔근', 'squat 스쿼트'],
    ['프론트 스쿼트', 'Front Squat', '하체', '바벨', '대퇴사두,코어', 'frontsquat'],
    ['스미스머신 스쿼트', 'Smith Machine Squat', '하체', '스미스', '대퇴사두,둔근', ''],
    ['레그 프레스', 'Leg Press', '하체', '머신', '대퇴사두,둔근', 'legpress 레프'],
    ['핵 스쿼트', 'Hack Squat', '하체', '머신', '대퇴사두', 'hacksquat 핵스'],
    ['브이 스쿼트', 'V-Squat Machine', '하체', '머신', '대퇴사두,둔근', 'vsquat v스쿼트 브이스쿼트'],
    ['레그 익스텐션', 'Leg Extension', '하체', '머신', '대퇴사두', 'legextension 레익'],
    ['라잉 레그 컬', 'Lying Leg Curl', '하체', '머신', '햄스트링', 'legcurl 레그컬'],
    ['시티드 레그 컬', 'Seated Leg Curl', '하체', '머신', '햄스트링', ''],
    ['런지', 'Lunge', '하체', '맨몸', '대퇴사두,둔근', 'lunge 런지'],
    ['워킹 런지', 'Walking Lunge', '하체', '덤벨', '대퇴사두,둔근', ''],
    ['불가리안 스플릿 스쿼트', 'Bulgarian Split Squat', '하체', '덤벨', '대퇴사두,둔근', '불스',],
    ['스텝업', 'Step Up', '하체', '덤벨', '대퇴사두,둔근', 'stepup'],
    ['고블릿 스쿼트', 'Goblet Squat', '하체', '덤벨', '대퇴사두,둔근', 'goblet'],
    ['힙 쓰러스트', 'Barbell Hip Thrust', '하체', '바벨', '둔근,햄스트링', 'hipthrust 힙쓰'],
    ['글루트 브릿지', 'Glute Bridge', '하체', '맨몸', '둔근', 'bridge'],
    ['힙 어브덕션 머신', 'Hip Abduction Machine', '하체', '머신', '중둔근', 'abduction 아웃타이'],
    ['힙 어덕션 머신', 'Hip Adduction Machine', '하체', '머신', '내전근', 'adduction 이너타이'],
    ['스탠딩 카프 레이즈', 'Standing Calf Raise', '하체', '머신', '비복근', 'calf 종아리'],
    ['시티드 카프 레이즈', 'Seated Calf Raise', '하체', '머신', '가자미근', '종아리'],
    ['케틀벨 스윙', 'Kettlebell Swing', '하체', '기타', '둔근,햄스트링,코어', 'kettlebell 케틀벨'],

    // ── 코어 ─────────────────────────────────────────────
    ['크런치', 'Crunch', '코어', '맨몸', '복직근', 'crunch'],
    ['싯업', 'Sit Up', '코어', '맨몸', '복직근,장요근', 'situp 윗몸일으키기'],
    ['레그 레이즈', 'Leg Raise', '코어', '맨몸', '하복부', 'legraise'],
    ['행잉 레그 레이즈', 'Hanging Leg Raise', '코어', '맨몸', '하복부', ''],
    ['플랭크', 'Plank', '코어', '맨몸', '복횡근,코어', 'plank 플랭크', 'time'],
    ['사이드 플랭크', 'Side Plank', '코어', '맨몸', '복사근', '', 'time'],
    ['러시안 트위스트', 'Russian Twist', '코어', '맨몸', '복사근', 'russian'],
    ['케이블 크런치', 'Cable Crunch', '코어', '케이블', '복직근', ''],
    ['앱 크런치 머신', 'Ab Crunch Machine', '코어', '머신', '복직근', ''],
    ['우드찹', 'Cable Woodchop', '코어', '케이블', '복사근', 'woodchop'],
    ['데드버그', 'Dead Bug', '코어', '맨몸', '코어', 'deadbug'],
    ['마운틴 클라이머', 'Mountain Climber', '코어', '맨몸', '코어,고관절굴곡근', 'mountainclimber', 'time'],

    // ── 유산소 ───────────────────────────────────────────
    ['트레드밀 러닝', 'Treadmill Running', '유산소', '머신', '전신', 'treadmill 러닝머신 달리기', 'time'],
    ['인클라인 워킹', 'Incline Treadmill Walk', '유산소', '머신', '하체', '경사걷기', 'time'],
    ['사이클', 'Stationary Bike', '유산소', '머신', '하체', 'bike 자전거 스피닝', 'time'],
    ['로잉 머신', 'Rowing Machine', '유산소', '머신', '전신', 'rowing 로잉', 'time'],
    ['일립티컬', 'Elliptical', '유산소', '머신', '전신', 'elliptical', 'time'],
    ['스텝밀', 'Stair Climber', '유산소', '머신', '하체', '천국의계단 stairmaster', 'time'],
    ['버피', 'Burpee', '유산소', '맨몸', '전신', 'burpee 버피'],
    ['배틀 로프', 'Battle Rope', '유산소', '기타', '전신,어깨', 'battlerope', 'time'],
    ['줄넘기', 'Jump Rope', '유산소', '기타', '전신', 'jumprope', 'time']
  ];

  // 한글 초성 추출 (초성 검색 지원: "ㅂㅊㅍ" → 벤치프레스)
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  function chosung(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
      else if (str[i] !== ' ') out += str[i];
    }
    return out;
  }

  function slug(en) {
    return en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  var BUILT_IN = RAW.map(function (r) {
    var name = r[0], en = r[1];
    var muscles = r[4] ? r[4].split(',') : [];
    return {
      id: 'x-' + slug(en),
      name: name,
      en: en,
      part: r[2],
      equip: r[3],
      muscles: muscles,
      type: r[6] || 'reps',
      custom: false,
      _search: [name, en, r[3], r[2], muscles.join(' '), r[5] || '']
        .join(' ').toLowerCase().replace(/\s+/g, ' '),
      _cho: chosung(name)
    };
  });

  // 사용자 추가 운동을 내장 DB와 같은 형태로 보정
  function normalize(ex) {
    var muscles = Array.isArray(ex.muscles) ? ex.muscles : (ex.muscles ? String(ex.muscles).split(',') : []);
    return {
      id: ex.id,
      name: ex.name,
      en: ex.en || '',
      part: ex.part || '기타',
      equip: ex.equip || '기타',
      muscles: muscles,
      type: ex.type === 'time' ? 'time' : 'reps',
      custom: true,
      _search: [ex.name, ex.en || '', ex.equip || '', ex.part || '', muscles.join(' ')]
        .join(' ').toLowerCase().replace(/\s+/g, ' '),
      _cho: chosung(ex.name)
    };
  }

  // 검색: 이름/영문/부위/장비/근육/초성 부분 일치. 공백은 AND 조건.
  function search(list, query, filters) {
    filters = filters || {};
    var result = list;
    if (filters.part) result = result.filter(function (e) { return e.part === filters.part; });
    if (filters.equip) result = result.filter(function (e) { return e.equip === filters.equip; });

    var q = (query || '').trim().toLowerCase();
    if (!q) return result;

    var terms = q.split(/\s+/);
    var isCho = /^[ㄱ-ㅎ]+$/.test(query.replace(/\s+/g, ''));

    return result.filter(function (e) {
      return terms.every(function (t) {
        if (isCho) return e._cho.indexOf(t) !== -1;
        return e._search.indexOf(t) !== -1 || e._cho.indexOf(t) !== -1;
      });
    }).sort(function (a, b) {
      // 이름 앞부분 일치를 우선 노출
      var ai = a.name.toLowerCase().indexOf(terms[0]);
      var bi = b.name.toLowerCase().indexOf(terms[0]);
      if (ai === -1) ai = 99;
      if (bi === -1) bi = 99;
      return ai - bi;
    });
  }

  global.ExerciseDB = {
    PARTS: PARTS,
    EQUIPS: EQUIPS,
    builtIn: BUILT_IN,
    normalize: normalize,
    search: search,
    chosung: chosung
  };
})(window);
