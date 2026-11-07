(function(root){
  'use strict';
  const locales=['zh-TW','en','ja','ko'];
  const rows=[
    ['請在 Chrome 登入 Claude；完成後會自動關閉專用視窗並同步配額。若未自動關閉，可手動關窗。','Sign in to Claude in Chrome. The dedicated window closes automatically before quota sync. If it stays open, close it manually.','Chrome で Claude にログインすると専用画面を自動で閉じて同期します。閉じない場合は手動で閉じてください。','Chrome에서 Claude에 로그인하면 전용 창이 자동으로 닫히고 동기화됩니다. 닫히지 않으면 직접 닫으세요.'],
    ['使用 Chrome 登入，完成後自動關閉專用視窗並同步；每 15 分鐘更新配額。','Sign in with Chrome; the dedicated window closes automatically to sync. Quota refreshes every 15 minutes.','Chrome ログイン後、専用画面を自動で閉じて同期します。使用量は15分ごとに更新します。','Chrome 로그인 후 전용 창이 자동으로 닫히고 동기화됩니다. 할당량은 15분마다 업데이트됩니다.'],
    ['請在 Chrome 登入 Claude；登入完成後關閉這個專用視窗，App 會自動同步配額。','Sign in to Claude in Chrome, then close this dedicated window. The app will sync your quota automatically.','Chrome で Claude にログインした後、この専用ウィンドウを閉じると使用量を自動同期します。','Chrome에서 Claude에 로그인한 후 이 전용 창을 닫으면 할당량이 자동으로 동기화됩니다.'],
    ['使用 Chrome 登入；關閉專用登入視窗後自動同步，每 15 分鐘更新配額。','Sign in with Chrome; close the dedicated sign-in window to sync. Quota updates every 15 minutes.','Chrome でログインし、専用画面を閉じると同期します。使用量は15分ごとに更新します。','Chrome에서 로그인한 후 전용 창을 닫으면 동기화됩니다. 할당량은 15분마다 업데이트됩니다.'],
    ['請在 Chrome 登入 Claude，完成後會自動確認帳號並同步配額。','Sign in to Claude in Chrome. Your account and quota will sync automatically.','Chrome で Claude にログインすると、アカウントと使用量を自動同期します。','Chrome에서 Claude에 로그인하면 계정과 할당량이 자동으로 동기화됩니다.'],
    ['請先在 Chrome 完成 Claude 登入','Finish signing in to Claude in Chrome first','先に Chrome で Claude にログインしてください','먼저 Chrome에서 Claude 로그인을 완료하세요'],
    ['找不到 Google Chrome，請先安裝 Chrome','Google Chrome was not found. Install Chrome first.','Google Chrome が見つかりません。Chrome をインストールしてください。','Google Chrome을 찾을 수 없습니다. Chrome을 설치하세요.'],
    ['Chrome 登入視窗已關閉','Chrome sign-in window was closed','Chrome ログイン画面が閉じられました','Chrome 로그인 창이 닫혔습니다'],
    ['Chrome 登入逾時，請重試','Chrome sign-in timed out. Try again.','Chrome ログインがタイムアウトしました。再試行してください。','Chrome 로그인 시간이 초과되었습니다. 다시 시도하세요.'],
    ['Claude 網頁登入','Claude web sign-in','Claude Web ログイン','Claude 웹 로그인'],
    ['選擇要監控的 Claude 組織','Choose the Claude organization to monitor','監視する Claude 組織を選択','모니터링할 Claude 조직 선택'],
    ['獨立的 Claude 網頁登入；每 15 分鐘查詢配額，帳號與組織分開保存。','Dedicated Claude web sign-in; quota refreshes every 15 minutes, with separate accounts and organizations.','専用の Claude Web ログイン。15分ごとに取得し、アカウントと組織を分離します。','별도의 Claude 웹 로그인. 15분마다 할당량을 조회하며 계정과 조직을 구분합니다.'],
    ['請在獨立視窗登入 Claude，再按「已登入正確帳號，繼續授權」確認組織並同步。','Sign in to Claude in the dedicated window, then continue to confirm your organization and sync.','専用ウィンドウで Claude にログインし、続行して組織の確認と同期を行ってください。','별도 창에서 Claude에 로그인한 후 계속을 눌러 조직을 확인하고 동기화하세요.'],
    ['正在驗證 Claude 網頁帳號與配額…','Verifying Claude web account and quota…','Claude Web アカウントと使用量を確認中…','Claude 웹 계정 및 할당량 확인 중…'],
    ['請在獨立的 Claude 登入視窗登入','Sign in using the dedicated Claude window','専用の Claude ウィンドウでログインしてください','별도의 Claude 창에서 로그인하세요'],
    ['Claude 網頁拒絕存取；請在登入視窗確認驗證或權限','Claude web access was denied. Check verification or permissions in the sign-in window.','Claude Web へのアクセスが拒否されました。ログイン画面で認証と権限を確認してください。','Claude 웹 접근이 거부되었습니다. 로그인 창에서 인증 및 권한을 확인하세요.'],
    ['Claude 網頁配額暫時限流','Claude web quota requests are temporarily rate limited','Claude Web 使用量の取得が一時制限されています','Claude 웹 할당량 조회가 일시적으로 제한되었습니다'],
    ['Claude 網頁配額查詢冷卻中','Claude web quota requests are cooling down','Claude Web 使用量の取得は待機中です','Claude 웹 할당량 조회 대기 중'],
    ['此 Claude 帳號未提供可用組織','No organization is available for this Claude account','この Claude アカウントに利用可能な組織がありません','이 Claude 계정에 사용 가능한 조직이 없습니다'],
    ['請先開啟 Claude 網頁登入視窗','Open the Claude web sign-in window first','先に Claude Web ログイン画面を開いてください','먼저 Claude 웹 로그인 창을 여세요'],
    ['已取消組織選擇','Organization selection cancelled','組織の選択をキャンセルしました','조직 선택을 취소했습니다'],
    ['無法確認 Claude 網頁帳號身分','Unable to verify the Claude web account','Claude Web アカウントを確認できません','Claude 웹 계정을 확인할 수 없습니다'],
    ['目前帳號不屬於選取的 Claude 組織','The current account does not belong to the selected organization','現在のアカウントは選択した組織に所属していません','현재 계정은 선택한 조직에 속하지 않습니다'],
    ['Claude 帳號已變更，請重新確認組織','Claude account changed. Confirm the organization again.','Claude アカウントが変更されました。組織を再確認してください。','Claude 계정이 변경되었습니다. 조직을 다시 확인하세요.'],
    ['Claude 網頁配額連線失敗','Unable to connect to Claude web quota','Claude Web 使用量への接続に失敗しました','Claude 웹 할당량 연결 실패'],
    ['Claude 網頁回應讀取失敗','Unable to read the Claude web response','Claude Web の応答を読み取れません','Claude 웹 응답을 읽을 수 없습니다'],
    ['Claude 網頁回傳格式無法辨識','Unrecognized Claude web response format','Claude Web の応答形式を認識できません','Claude 웹 응답 형식을 인식할 수 없습니다'],
    ['Claude 網頁尚未提供 JSON 配額；請檢查登入視窗','Claude has not returned quota data. Check the sign-in window.','Claude が使用量データを返していません。ログイン画面を確認してください。','Claude에서 할당량 데이터를 반환하지 않았습니다. 로그인 창을 확인하세요.'],
    ['Claude 授權已過期，請重新登入','Claude authorization has expired. Sign in again.','Claude の認証が期限切れです。再ログインしてください。','Claude 인증이 만료되었습니다. 다시 로그인하세요.'],
    ['查看官方配額 ↗','View official usage ↗','公式の使用量を確認 ↗','공식 사용량 보기 ↗'],
    ['等待登入','Sign-in needed','ログイン待ち','로그인 대기'],['繼續登入','Continue sign-in','ログインを続行','로그인 계속'],['查看登入進度','Sign-in status','ログイン状況','로그인 진행'],
    ['任務完成／閒置提醒','Completion / idle alerts','完了・待機の通知','완료 / 유휴 알림'],
    ['預覽 3 分鐘，期間可隨時關閉','Preview for 3 minutes; dismiss at any time.','3分間プレビュー。いつでも閉じられます。','3분간 미리보기, 언제든 닫을 수 있습니다.'],
    ['常駐散步陪伴','Resident roaming pet','常駐お散歩ペット','상주 산책 친구'],['常駐向左、向右散步；關閉後才離開，救援短劇結束後恢復散步','Walks left and right until dismissed; resumes after rescue scenes.','閉じるまで左右にお散歩。救援劇の後はお散歩を再開します。','닫을 때까지 좌우로 산책하며 구조 극장이 끝나면 다시 산책합니다.'],
    ['隨機角色散步 24 秒；自動模式每 2–5 分鐘出現一次','A random pet strolls for 24 seconds; automatic visits occur every 2–5 minutes.','ランダムなペットが24秒お散歩。自動では2～5分ごとに登場します。','무작위 펫이 24초 산책하며 자동 모드에서는 2~5분마다 나타납니다.'],
    ['自動散步陪伴','Automatic roaming companion','自動お散歩ペット','자동 산책 친구'],['叫出散步寵物','Invite a roaming pet','お散歩ペットを呼ぶ','산책 펫 부르기'],['太空散步','Space stroll','宇宙のお散歩','우주 산책'],['職守中','On duty','見守り中','근무 중'],['休息一下','Taking a break','ひと休み','잠시 쉬는 중'],['陪你休息','Resting with you','一緒に休憩','함께 쉬어요'],['關閉散步','Dismiss roaming pet','お散歩を終了','산책 종료'],['隨機角色陪伴，不代表帳號配額','Random companion; not an account quota indicator','ランダムな仲間です。アカウントの利用枠は示しません','무작위 친구이며 계정 할당량을 나타내지 않습니다'],
    ['寵物動作風格','Pet animation style','ペットの動作スタイル','펫 애니메이션 스타일'],['柔順 3D','Smooth 3D','なめらか3D','부드러운 3D'],['像素逐格','Pixel animation','ピクセルアニメ','픽셀 애니메이션'],['原版 3D','Classic 3D','従来の3D','기존 3D'],
    ['預覽名稱區寵物','Preview title pet','タイトルのペットをプレビュー','제목 영역 펫 미리보기'],
    ['點擊舞台投食','Click the stage to feed','ステージをクリックしてごはん','무대를 클릭하여 먹이 주기'],
    ['動作','Action','動作','동작'],['預覽','Preview','プレビュー','미리보기'],['套用','Apply','適用','적용'],['舞台背景','Stage background','ステージ背景','무대 배경'],["流星山林 · 白天","Meteor forest · Day","流星と山林 · 昼","유성과 숲 · 낮"],["流星山林 · 夜晚","Meteor forest · Night","流星と山林 · 夜","유성과 숲 · 밤"],["雲海浮島 · 白天","Cloud islands · Day","雲海の浮島 · 昼","구름 위 섬 · 낮"],["雲海浮島 · 夜晚","Cloud islands · Night","雲海の浮島 · 夜","구름 위 섬 · 밤"],["櫻花庭園 · 白天","Sakura garden · Day","桜の庭園 · 昼","벚꽃 정원 · 낮"],["櫻花庭園 · 夜晚","Sakura garden · Night","桜の庭園 · 夜","벚꽃 정원 · 밤"],["海岸燈塔 · 白天","Coastal lighthouse · Day","海岸の灯台 · 昼","해안 등대 · 낮"],["海岸燈塔 · 夜晚","Coastal lighthouse · Night","海岸の灯台 · 夜","해안 등대 · 밤"],["雪山木屋 · 白天","Snowy cabin · Day","雪山の山小屋 · 昼","설산 오두막 · 낮"],["雪山木屋 · 夜晚","Snowy cabin · Night","雪山の山小屋 · 夜","설산 오두막 · 밤"],["太空溫室 · 白天","Space greenhouse · Day","宇宙温室 · 昼","우주 온실 · 낮"],["太空溫室 · 夜晚","Space greenhouse · Night","宇宙温室 · 夜","우주 온실 · 밤"],
    ['呼…','Sigh…','ふぅ…','후…'],
    ['開機自動啟動','Launch at login','ログイン時に起動','로그인 시 자동 시작'],
    ['叫出常駐寵物','Summon resident pet','常駐ペットを呼ぶ','상주 펫 부르기'],
    ['寵物常駐在名稱區，關閉常駐後恢復名稱與版本號','Pet stays in the title area; disable residency to restore the name and version.','名前エリアに常駐します。常駐をオフにすると名前とバージョンが戻ります。','이름 영역에 상주하며 끄면 이름과 버전이 복원됩니다.'],
    ['常駐位置','Companion position','常駐する場所','상주 위치'],['下方舞台','Lower stage','下のステージ','하단 무대'],['上方區域','Upper area','上部エリア','상단 영역'],
    ['補充電力','Recharge','充電する','충전하기'],['走路','Walk','歩く','걷기'],['開啟 Claude Code','Open Claude Code','Claude Code を開く','Claude Code 열기'],['已登入正確帳號，繼續授權','Signed in to the correct account — continue','正しいアカウントでログイン済み・認証へ','올바른 계정 로그인 완료 · 인증 계속'],['先在 Claude 網頁登入要監控的帳號，再按「已登入正確帳號，繼續授權」。','Sign in to the account you want to monitor on Claude first, then continue authorization.','Claude で監視するアカウントにログインしてから認証へ進んでください。','Claude 웹에서 모니터링할 계정에 로그인한 후 인증을 계속하세요.'],['預覽動作','Preview action','動作プレビュー','동작 미리보기'],['打招呼','Greeting','あいさつ','인사'],['垂頭喪氣','Feeling low','しょんぼり','시무룩'],['睡覺','Sleep','おやすみ','잠자기'],['喝水提醒','Water break','水分補給','물 마시기'],['預覽寵物動作','Preview pet action','ペットの動作をプレビュー','펫 동작 미리보기'],['開飯了！','Food is here!','ごはんだ！','밥 먹자!'],['好好吃！','Yummy!','おいしい！','맛있어!'],['跟你打招呼','Hello there!','こんにちは！','안녕!'],['偶爾也會有點累','A little tired today','ちょっとお疲れ','조금 피곤해요'],['充電小睡中','Recharging with a nap','お昼寝で充電中','낮잠으로 충전 중'],['記得喝水喔','Remember to drink water','お水を飲もう','물 마시는 것 잊지 마세요'],
    ['叫出角色','Summon character','呼び出すキャラクター','불러올 캐릭터'],['隨機角色','Random character','ランダム','무작위'],['小章魚','Little Octopus','小さなタコ','아기 문어'],
    ['預覽救援隊','Preview rescue crew','レスキュー隊をプレビュー','구조대 미리보기'],['預覽・展示資料','Preview · demo data','プレビュー・デモデータ','미리보기 · 데모 데이터'],
    ['寵物設定','Pet settings','ペット設定','펫 설정'],['待機小寵物','Idle companions','待機中のペット','대기 중 펫'],['配額告警小劇場','Quota alert theater','利用枠アラート劇場','할당량 알림 극장'],['剩餘 20%、5% 與用盡時提醒；同一帳號與配額週期不重複。遵循系統減少動態設定。','Alerts at 20%, 5% remaining and exhaustion, once per account and quota cycle. Respects reduced motion.','残量20%、5%、使い切り時に通知。同じアカウント・利用枠周期では繰り返しません。視差効果を減らす設定に対応。','잔여 20%, 5%, 소진 시 계정 및 할당량 주기마다 한 번 알립니다. 모션 줄이기 설정을 따릅니다.'],['關閉小劇場','Dismiss theater','劇場を閉じる','극장 닫기'],['額度用盡，先休息一下','Quota exhausted. Time to rest.','利用枠を使い切りました。休憩しましょう','할당량 소진, 잠시 쉬어요'],['能源即將用盡，放慢腳步','Energy nearly empty. Slow down.','エネルギー残りわずか。ペースを落とそう','에너지가 거의 없어요. 천천히 해요'],['能源偏低，救援隊出動','Low energy. Rescue crew incoming.','エネルギー低下。レスキュー隊出動','에너지 부족, 구조대 출동'],['等待重置，一起充電','Recharge while waiting for reset.','リセットを待ちながら充電しよう','초기화를 기다리며 충전해요'],['補給一下，保持配速','Refuel and keep a steady pace.','補給して、ペースを保とう','보급하고 페이스를 유지해요'],
    ['自動 Hello','Automatic Hello','自動 Hello','자동 Hello'],['閒置時啟動 Claude 5 小時視窗','Start an idle Claude 5-hour window','未使用時に Claude の5時間枠を開始','미사용 시 Claude 5시간 이용 기간 시작'],
    ['不限時間：偵測到 5 小時用量為 0%，且沒有進行中的視窗時送出 Hello。所有已連接的 Claude 帳號獨立檢查，會消耗少量額度；每次嘗試至少間隔 5 小時。App 需保持執行。','Any time: send Hello when 5-hour usage is 0% and no window is active. Checks each connected Claude account separately and uses some quota. Attempts are at least 5 hours apart. Keep the app running.','時刻に関係なく、5時間使用量が0%で開始済みの枠がない場合に Hello を送信します。接続済み Claude アカウントごとに判定し、少量の利用枠を消費します。試行間隔は最低5時間です。アプリの起動が必要です。','시간에 관계없이 5시간 사용량이 0%이고 진행 중인 이용 기간이 없으면 Hello를 전송합니다. 연결된 Claude 계정별로 확인하며 소량의 할당량을 사용합니다. 시도 간격은 최소 5시간이며 앱 실행이 필요합니다.'],
    ['已有視窗，持續監控','Window active; monitoring','利用枠は開始済み・監視中','이용 기간 진행 중, 모니터링'],['Hello 失敗，5 小時後再檢查','Hello failed; check again after 5 hours','Hello 失敗・5時間後に再確認','Hello 실패, 5시간 후 다시 확인'],['上次結果未確認，至少等待 5 小時','Previous result unknown; wait at least 5 hours','前回の結果不明・最低5時間待機','이전 결과 불명, 최소 5시간 대기'],
    ['早安 Hello','Morning Hello','朝の Hello','모닝 Hello'],['每天啟動 Claude 5 小時視窗','Start the daily Claude 5-hour window','毎日 Claude の5時間枠を開始','매일 Claude 5시간 이용 기간 시작'],['執行時間（台灣）','Time (Taiwan)','実行時刻（台湾）','실행 시간 (대만)'],
    ['所有已連接的 Claude 帳號，每天最多一次。會消耗少量額度；已有視窗則略過，不能提前重置。App 需保持執行，錯過後 4 小時內可補送。','All connected Claude accounts, at most once daily. Uses some quota; skips active windows and cannot reset them early. Keep the app running; missed runs can catch up within 4 hours.','接続済みの全 Claude アカウントで1日最大1回。少量の利用枠を消費し、開始済みの枠はスキップします。早期リセットはできません。アプリの起動が必要で、予定から4時間以内なら実行できます。','연결된 모든 Claude 계정에서 하루 최대 한 번 실행합니다. 소량의 할당량을 사용하며 이미 시작된 기간은 건너뜁니다. 조기 초기화는 불가합니다. 앱 실행이 필요하며 예정 시간 후 4시간 이내에 실행할 수 있습니다.'],
    ['正在送出 Hello','Sending Hello','Hello を送信中','Hello 전송 중'],['Hello 已送出，等待配額同步','Hello sent; waiting for quota sync','Hello 送信済み・利用枠の同期待ち','Hello 전송 완료, 할당량 동기화 대기'],['已確認 5 小時視窗','5-hour window confirmed','5時間枠を確認済み','5시간 이용 기간 확인됨'],['已有 5 小時視窗，今日略過','Window already active; skipped today','5時間枠は開始済み・本日はスキップ','이미 이용 기간이 시작되어 오늘은 건너뜀'],['Hello 失敗，今日不會自動重送','Hello failed; no automatic retry today','Hello 失敗・本日の自動再送なし','Hello 실패, 오늘 자동 재전송 없음'],['上次結果未確認，避免重複送出','Previous result unknown; avoiding duplicate send','前回の結果不明・重複送信を防止','이전 결과를 확인할 수 없어 중복 전송 방지'],
    ['切換下一個帳號','Next account','次のアカウント','다음 계정'],
    ['未提供週額度','No weekly quota','週間利用枠なし','주간 할당량 없음'],
    ['重新命名','Rename','名前を変更','이름 변경'],['儲存','Save','保存','저장'],['無法重新命名','Unable to rename','名前を変更できません','이름을 변경할 수 없습니다'],
    ['帳號名稱已使用，請換個名稱','This account name is in use. Choose another name.','このアカウント名は使用中です。別の名前を入力してください。','이미 사용 중인 계정 이름입니다. 다른 이름을 입력하세요.'],
    ['＋ 新增帳號','＋ Add account','＋ アカウント追加','＋ 계정 추가'],['Claude 帳號名稱','Claude account name','Claude アカウント名','Claude 계정 이름'],['例如：Claude 工作帳號','For example: Claude Work','例：Claude 仕事用','예: Claude 업무용'],['新增獨立 Claude 登入，不會更改目前的帳號。','Add a separate Claude sign-in without changing your current account.','現在のアカウントを変更せず、独立した Claude ログインを追加します。','현재 계정을 변경하지 않고 별도의 Claude 로그인을 추가합니다.'],['新增並登入','Add and sign in','追加してログイン','추가 후 로그인'],['移除帳號','Remove account','アカウント削除','계정 제거'],['確認移除','Confirm removal','削除を確認','제거 확인'],['只移除此獨立帳號，不影響其他帳號。','Remove only this independent account. Other accounts stay connected.','この独立アカウントのみ削除します。他のアカウントには影響しません。','이 독립 계정만 제거합니다. 다른 계정에는 영향을 주지 않습니다.'],['只登出此獨立帳號，不影響其他帳號。','Sign out only this independent account. Other accounts stay connected.','この独立アカウントのみログアウトします。他のアカウントには影響しません。','이 독립 계정만 로그아웃합니다. 다른 계정에는 영향을 주지 않습니다.'],['請輸入 1 至 24 字的帳號名稱','Enter an account name of 1–24 characters.','1～24文字のアカウント名を入力してください。','1~24자의 계정 이름을 입력하세요.'],['無法新增帳號','Unable to add account','アカウントを追加できません','계정을 추가할 수 없습니다'],['最多可新增 20 個獨立帳號','Up to 20 independent accounts can be added.','独立アカウントは20個まで追加できます。','독립 계정은 최대 20개까지 추가할 수 있습니다.'],
    ['建議用量','Suggested use','推奨使用量','권장 사용량'],
    ['收起配速詳情 ⌃','Hide pace details ⌃','ペース詳細を閉じる ⌃','페이스 상세 접기 ⌃'],
    ['剩餘額度已在保留範圍內，建議暫停使用。','The remaining quota is within your reserve. Consider pausing usage.','残りの利用枠は予備枠内です。利用の一時停止を推奨します。','남은 할당량이 예비 범위 내에 있습니다. 사용을 잠시 중단하는 것을 권장합니다.'],
    ['配速','Pace','ペース','페이스'],['配速建議','Pacing advice','ペース目安','페이스 권장'],['配速詳情','Pacing details','ペース詳細','페이스 상세'],['配速詳情 ›','Pace details ›','ペース詳細 ›','페이스 상세 ›'],['配額窗口','Quota window','利用枠の期間','할당량 기간'],['保留比例','Reserve','予備枠','예비 비율'],['保留','Reserve','予備','예비'],['可分配','Available to budget','配分可能','배분 가능'],['配速暫不可用','Pacing unavailable','ペース算出不可','페이스 계산 불가'],['等待配額資料','Waiting for quota','利用枠データ待ち','할당량 대기 중'],['%／天','% / day','% / 日','% / 일'],['%／小時','% / hour','% / 時間','% / 시간'],['小時','hours','時間','시간'],['天','days','日','일'],
    ['保留比例以總配額為基準；各來源與窗口獨立計算。','Reserve is a percentage of total quota. Each source and window is calculated separately.','予備枠は総利用枠に対する割合です。各ソース・期間は個別に計算します。','예비 비율은 전체 할당량 기준입니다. 각 소스와 기간은 별도로 계산합니다.'],
    ['這是平均分配建議，不是用量上限；少於一天的窗口改以每小時計算。','This is an average budget, not a usage limit. Windows under one day use hourly pacing.','平均配分の目安であり、利用上限ではありません。1日未満の期間は時間単位で計算します。','평균 배분 권장량이며 사용 한도가 아닙니다. 하루 미만의 기간은 시간 단위로 계산합니다.'],
    ['不足一小時，建議量以可分配餘額為上限。','Under one hour remains; guidance is capped at the available balance.','残り1時間未満のため、配分可能な残量を上限とします。','남은 시간이 1시간 미만이면 배분 가능한 잔여량을 넘지 않도록 제한합니다.'],
    ['已中斷連接','Disconnected','接続解除済み','연결 해제됨'],['Antigravity 仍保持登入，可在帳號頁重新連接。','Antigravity stays signed in. Reconnect from Accounts.','Antigravity はログインしたままです。アカウント画面で再接続できます。','Antigravity 로그인은 유지됩니다. 계정 화면에서 다시 연결하세요.'],
    ['中斷連接','Disconnect','接続を解除','연결 해제'],['等待在 Antigravity 切換帳號，完成後會自動更新配額','Waiting for an account change in Antigravity. Quotas update automatically.','Antigravity でアカウントを切り替えると利用枠が自動更新されます。','Antigravity에서 계정을 전환하면 할당량이 자동으로 업데이트됩니다.'],
    ['顯示服務','Visible services','表示するサービス','표시할 서비스'],['所有服務已隱藏，請到設定開啟顯示。','All services are hidden. Show them in Settings.','すべて非表示です。設定で表示を有効にしてください。','모든 서비스가 숨겨져 있습니다. 설정에서 표시를 켜세요.'],
    ['查看模型配額','View model limits','モデル利用枠を表示','모델 할당량 보기'],['Claude 模型配額','Claude model limits','Claude モデル利用枠','Claude 모델 할당량'],['每週配額','Weekly limits','週間利用枠','주간 할당량'],['模型專屬限制可能與所有模型限制同時適用，兩者不能相加。','Model-specific and all-model limits may apply together; their quotas cannot be added.','モデル別と全モデルの制限は同時に適用される場合があり、合算できません。','모델별 제한과 전체 모델 제한이 동시에 적용될 수 있으며 할당량을 합산할 수 없습니다.'],
    ['所有配額','All quota limits','すべての利用枠','모든 할당량'],['Antigravity 配額','Antigravity quotas','Antigravity 利用枠','Antigravity 할당량'],['查看所有配額','View all limits','すべて表示','모든 할당량 보기'],['返回配額','Back to quota','利用枠に戻る','할당량으로 돌아가기'],['來源尚未提供群組配額','Source has not provided group limits.','ソースにグループ利用枠がありません。','소스에서 그룹 할당량을 제공하지 않았습니다.'],
    ['以下都是 Antigravity 內的配額，不是獨立 Claude Code／Codex 訂閱額度。','All limits below belong to Antigravity, not your separate Claude Code or Codex subscriptions.','以下は Antigravity の利用枠です。独立した Claude Code／Codex のサブスクリプションとは異なります。','아래는 Antigravity 내부 할당량이며 별도의 Claude Code/Codex 구독 할당량과 다릅니다.'],
    ['同步詳情','Sync details','同期の詳細','동기화 상세'],['部分失敗','Some failed','一部失敗','일부 실패'],['限流期間仍會遵守服務冷卻時間。','Provider cooldowns still apply during rate limits.','制限中はサービスの待機時間を守ります。','요청 제한 중에는 서비스 대기 시간을 준수합니다.'],
    ['本次工作階段','Current session','現在のセッション','현재 세션'],['每週 · 所有模型','Weekly · All models','週間・全モデル','주간 · 모든 모델'],['模型專屬','Model-specific','モデル別','모델별'],
    ['配額','Quota','利用枠','할당량'],['帳號','Accounts','アカウント','계정'],['配額與帳號','Quota and accounts','利用枠とアカウント','할당량 및 계정'],
    ['切換帳號','Switch account','アカウント切替','계정 전환'],['登入帳號','Sign in','ログイン','로그인'],['登出','Sign out','ログアウト','로그아웃'],
    ['確認登出','Confirm sign out','ログアウトを確認','로그아웃 확인'],['取消','Cancel','キャンセル','취소'],
    ['登出也會影響本機官方 CLI，確定繼續？','Signing out also affects the local official CLI. Continue?','ローカルの公式 CLI もログアウトします。続行しますか？','로컬 공식 CLI도 로그아웃됩니다. 계속할까요?'],
    ['前往 Antigravity 切換','Switch in Antigravity','Antigravity で切替','Antigravity에서 전환'],
    ['請在 Antigravity 或 Google 帳號中管理授權','Manage authorization in Antigravity or your Google account.','Antigravity または Google アカウントで認証を管理してください。','Antigravity 또는 Google 계정에서 인증을 관리하세요.'],
    ['請自行開啟 Antigravity，在其中登出並切換 Google 帳號','Open Antigravity to sign out and switch your Google account.','Antigravity を開き、ログアウトして Google アカウントを切り替えてください。','Antigravity를 열고 로그아웃한 다음 Google 계정을 전환하세요.'],
    ['登出未完成，請稍後重試','Sign-out failed. Please retry.','ログアウトできませんでした。再試行してください。','로그아웃하지 못했습니다. 다시 시도하세요.'],
    ['請先取消或完成目前的登入','Cancel or finish the current sign-in first.','現在のログインを完了またはキャンセルしてください。','먼저 진행 중인 로그인을 취소하거나 완료하세요.'],
    ['請登入以讀取配額','Sign in to read quota.','利用枠を取得するにはログインしてください。','할당량을 읽으려면 로그인하세요.'],
    ['展示模式不會登出帳號','Demo mode does not sign out accounts.','デモではログアウトしません。','데모에서는 계정을 로그아웃하지 않습니다.'],
    ['展示模式不會開啟外部應用','Demo mode does not open external apps.','デモでは外部アプリを開きません。','데모에서는 외부 앱을 열지 않습니다.'],
    ['下次重置','Next reset:','次回リセット','다음 초기화'],
    ['取消登入','Cancel sign-in','ログインをキャンセル','로그인 취소'],
    ['驗證授權碼中…','Verifying code…','コードを確認中…','코드 확인 중…'],
    ['正在驗證授權碼，最多等待 60 秒；可取消後重新登入。','Verifying your code (up to 60 seconds). You can cancel and sign in again.','認証コードを確認中（最大60秒）。キャンセルして再ログインできます。','인증 코드 확인 중 (최대 60초). 취소 후 다시 로그인할 수 있습니다.'],
    ['授權碼驗證逾時，請重新登入取得新授權碼。','Code verification timed out. Sign in again to get a new code.','コードの確認がタイムアウトしました。再ログインして新しいコードを取得してください。','코드 확인 시간이 초과되었습니다. 다시 로그인하여 새 코드를 받으세요.'],
    ['帳號授權已完成；配額查詢仍在冷卻，期滿後會自動同步。','Account authorized. Quota queries are cooling down and will sync automatically afterward.','アカウント認証は完了しました。利用枠の取得は待機中です。待機後に自動同期します。','계정 인증이 완료되었습니다. 할당량 조회 대기 시간이 끝나면 자동 동기화됩니다.'],
    ['正在等待官方登入程序完成驗證；配額限流不會阻止帳號授權。','Waiting for the official sign-in process. Quota rate limits do not block account authorization.','公式ログイン処理の完了を待っています。利用枠の制限はアカウント認証を妨げません。','공식 로그인 절차가 완료되기를 기다립니다. 할당량 제한은 계정 인증을 차단하지 않습니다.'],
    ['請在瀏覽器完成登入；若選錯帳號，可取消後重試。','Finish sign-in in your browser. Wrong account? Cancel and try again.','ブラウザーでログインしてください。アカウントを間違えた場合はキャンセルして再試行できます。','브라우저에서 로그인을 완료하세요. 잘못된 계정이면 취소 후 다시 시도하세요.'],
    ['等待瀏覽器授權，完成後會自動同步配額…','Authorize in the browser; quota will sync automatically.','ブラウザーで認証してください。完了後に利用枠を自動同期します。','브라우저에서 인증하세요. 완료 후 할당량이 자동 동기화됩니다.'],
    ['授權完成，正在自動同步配額…','Authorized. Syncing quota…','認証完了。利用枠を同期中…','인증 완료. 할당량 동기화 중…'],
    ['瀏覽器授權後，將頁面提供的授權碼貼在下方，App 會自動完成連接與同步。','After browser authorization, paste its code below to connect and sync.','ブラウザー認証後、表示されたコードを下に貼り付けると接続して同期します。','브라우저 인증 후 표시된 코드를 아래에 붙여넣으면 연결 및 동기화됩니다.'],
    ['正在驗證授權碼，完成後會自動同步…','Verifying code; quota will sync automatically…','コードを確認中。完了後に自動同期します…','코드 확인 중. 완료 후 자동 동기화됩니다…'],
    ['請貼上授權頁提供的完整授權碼','Paste the complete authorization code.','認証ページのコード全体を貼り付けてください。','인증 페이지의 전체 코드를 붙여넣으세요.'],
    ['登入未完成，請重試','Sign-in incomplete. Please retry.','ログイン未完了。再試行してください。','로그인이 완료되지 않았습니다. 다시 시도하세요.'],
    ['Claude 登入已取消','Claude sign-in canceled.','Claude ログインをキャンセルしました。','Claude 로그인이 취소되었습니다.'],
    ['Claude 登入逾時，請重新連接','Claude sign-in timed out. Reconnect.','Claude ログインがタイムアウトしました。再接続してください。','Claude 로그인 시간이 초과되었습니다. 다시 연결하세요.'],
    ['服務暫時限制查詢頻率，等待後將自動重試','Requests rate-limited. Retrying after cooldown.','リクエスト制限中。待機後に再試行します。','요청이 제한되었습니다. 대기 후 재시도합니다.'],
    ['目前限制的是配額查詢，不代表已登出。可登入或更新授權；重新登入不會解除限流。','Only quota queries are limited; you are not necessarily signed out. You can manage sign-in, but it will not clear the cooldown. ','利用枠の取得のみ制限中です。ログアウトを意味しません。認証を更新できますが、待機時間は解除されません。','할당량 조회만 제한된 상태이며 로그아웃을 의미하지 않습니다. 인증을 갱신할 수 있지만 대기 시간은 해제되지 않습니다. '],
    ['冷卻後自動重試','Retries after cooldown','待機後に自動再試行','대기 후 자동 재시도'],
    ['Antigravity 本機服務的 Gemini 模型配額；沿用 Antigravity 帳號，需保持 Antigravity 執行。這不是 Gemini 網頁版或企業 Code Assist 額度。','Gemini model quotas from the local Antigravity service. Keep Antigravity running. Not Gemini web or enterprise Code Assist quota.','Antigravity のローカルサービスから Gemini 利用枠を取得します。起動したままにしてください。Gemini Web・法人 Code Assist の枠とは異なります。','로컬 Antigravity 서비스의 Gemini 모델 할당량입니다. Antigravity를 실행 상태로 유지하세요. Gemini 웹이나 기업 Code Assist 할당량과 다릅니다.'],
    ['企業 Code Assist OAuth 配額；個人版請選擇 Antigravity 來源。','Enterprise Code Assist OAuth quota. Personal users should choose Antigravity.','法人 Code Assist OAuth 利用枠。個人の場合は Antigravity を選択してください。','기업 Code Assist OAuth 할당량입니다. 개인 사용자는 Antigravity를 선택하세요.'],
    ['官方 Codex app-server · account/rateLimits/read。由 Codex CLI 管理 ChatGPT 帳號授權。','Official Codex app-server · account/rateLimits/read. ChatGPT authorization is managed by Codex CLI.','公式 Codex app-server · account/rateLimits/read。ChatGPT 認証は Codex CLI が管理します。','공식 Codex app-server · account/rateLimits/read. ChatGPT 인증은 Codex CLI에서 관리합니다.'],
    ['官方 Claude Code 管理登入，讀取本機授權後查詢 Claude OAuth 用量端點。','Official Claude Code manages sign-in; local authorization is used for the Claude OAuth usage endpoint.','公式 Claude Code のローカル認証で Claude OAuth 利用状況を取得します。','공식 Claude Code의 로컬 인증으로 Claude OAuth 사용량을 조회합니다.'],
    ['剩餘','Remaining','残り','남음'],['已用','Used','使用済み','사용'],
    ['剩餘額度','Remaining quota','残りの利用枠','남은 할당량'],['已用額度','Used quota','使用済みの枠','사용한 할당량'],
    ['語言','Language','言語','언어'],['配額動態島','Quota island','利用枠アイランド','할당량 아일랜드'],
    ['尚未同步','Not synced','未同期','동기화 전'],['剛剛同步','Just synced','同期済み','방금 동기화'],
    ['重設時間未提供','Reset time unavailable','リセット時刻なし','초기화 시간 없음'],['已到重設時間 · 等待同步','Reset due · awaiting sync','リセット時刻・同期待ち','초기화 예정 · 동기화 대기'],
    ['ChatGPT 訂閱','ChatGPT plan','ChatGPT プラン','ChatGPT 구독'],['Code Assist · 企業版','Code Assist · Enterprise','Code Assist · 法人','Code Assist · 기업'],
    ['已暫停','Paused','一時停止','일시 정지'],['已連接','Connected','接続済み','연결됨'],['更新失敗','Update failed','更新失敗','업데이트 실패'],
    ['同步中','Syncing','同期中','동기화 중'],['未連接','Not connected','未接続','연결 안 됨'],['服務限流','Rate limited','制限中','요청 제한'],['讀取失敗','Read failed','取得失敗','읽기 실패'],
    ['資料過期','Outdated','期限切れ','오래된 데이터'],['連接中','Connecting','接続中','연결 중'],['暫停','Paused','停止中','정지'],['限流中','Limited','制限中','제한 중'],['舊資料','Stale data','古いデータ','이전 데이터'],
    ['連接帳號','Connect account','アカウント接続','계정 연결'],['管理帳號連接','Manage account','アカウント管理','계정 관리'],['關閉連接詳情','Close account details','接続詳細を閉じる','연결 상세 닫기'],
    ['授權','Authorize','認証','인증'],['連接','Connect','接続','연결'],['同步','Sync','同期','동기화'],['完成','Done','完了','완료'],['連接進度','Connection progress','接続の進行状況','연결 진행 상황'],
    ['已連接，配額已自動同步','Connected. Quota synced automatically.','接続済み。利用枠を同期しました。','연결됨. 할당량이 자동 동기화되었습니다.'],
    ['完成授權後會自動同步配額。','Quota syncs after authorization.','認証後に利用枠を自動同期します。','인증 후 할당량이 자동 동기화됩니다.'],
    ['自動同步中…','Syncing…','同期中…','자동 동기화 중…'],['連接中…','Connecting…','接続中…','연결 중…'],['等待授權…','Waiting for authorization…','認証待ち…','인증 대기 중…'],
    ['切換 Codex 帳號 →','Switch Codex account →','Codex アカウント切替 →','Codex 계정 전환 →'],['登入 Codex（ChatGPT） →','Sign in to Codex (ChatGPT) →','Codex にログイン (ChatGPT) →','Codex 로그인 (ChatGPT) →'],
    ['重新連接','Reconnect','再接続','다시 연결'],['連接 Antigravity 並同步 →','Connect Antigravity →','Antigravity に接続 →','Antigravity 연결 →'],['重新同步','Sync again','再同期','다시 동기화'],['同步中…','Syncing…','同期中…','동기화 중…'],
    ['登入完成後自動更新，不必手動查用量。','Usage updates automatically after sign-in.','ログイン後、利用状況を自動更新します。','로그인 후 사용량이 자동 업데이트됩니다.'],
    ['登入要監控的 ChatGPT 訂閱帳號，可與 Claude、Gemini 使用不同帳號。','Sign in with the ChatGPT plan to monitor. Claude and Gemini can use different accounts.','監視する ChatGPT アカウントでログインしてください。Claude・Gemini と別のアカウントを使えます。','모니터링할 ChatGPT 계정으로 로그인하세요. Claude 및 Gemini와 다른 계정을 사용할 수 있습니다.'],
    ['沿用 Antigravity 的 Google 帳號，讀取 Gemini 配額資訊。','Uses your Antigravity Google account for Gemini quotas.','Antigravity の Google アカウントで Gemini 利用枠を取得します。','Antigravity의 Google 계정으로 Gemini 할당량을 읽습니다.'],
    [' Codex 使用獨立的 OpenAI／ChatGPT 授權；切換會同步更新本機 Codex CLI 的帳號，不會登出 Claude 或 Gemini。瀏覽器若帶入其他帳號，請選擇使用其他帳號登入。',' Codex uses separate OpenAI/ChatGPT authorization. Switching also updates the local Codex CLI account, without signing out Claude or Gemini. Choose another account in the browser if needed.',' Codex は独立した OpenAI/ChatGPT 認証を使います。切替時はローカル Codex CLI も更新されますが、Claude・Gemini はログアウトしません。必要ならブラウザーで別のアカウントを選択してください。',' Codex는 별도의 OpenAI/ChatGPT 인증을 사용합니다. 전환 시 로컬 Codex CLI 계정도 변경되며 Claude나 Gemini는 로그아웃되지 않습니다. 필요하면 브라우저에서 다른 계정을 선택하세요.'],
    ['已暫停此來源','Source paused','このソースは停止中','이 소스 일시 정지'],['等待授權碼','Waiting for code','認証コード待ち','인증 코드 대기'],['連接完成，正在同步…','Connected, syncing…','接続完了、同期中…','연결 완료, 동기화 중…'],['等待帳號連接…','Waiting for sign-in…','ログイン待ち…','로그인 대기 중…'],
    ['連接你的帳號','Connect your account','アカウントを接続','계정을 연결하세요'],['正在讀取配額…','Reading quota…','利用枠を取得中…','할당량 읽는 중…'],['資料已過期','Data is outdated','データの期限切れ','데이터가 오래됨'],['配額服務暫時限流','Quota requests rate-limited','利用枠の取得は一時制限中','할당량 요청 일시 제한'],['暫時無法取得配額','Quota unavailable','利用枠を取得できません','할당량을 가져올 수 없음'],
    ['服務回覆 HTTP 429','Service returned HTTP 429','サービス応答 HTTP 429','서비스 응답 HTTP 429'],['在設定中開啟來源即可恢復同步。','Enable this source in settings to resume.','設定でソースを有効にすると再開します。','설정에서 소스를 켜면 동기화가 재개됩니다.'],['完成連接後，配額會自動出現在這裡。','Connect an account to see quota here.','接続すると利用枠がここに表示されます。','계정을 연결하면 할당량이 표시됩니다.'],
    ['本機執行','Runs locally','ローカル実行','로컬 실행'],['展示資料','Demo data','デモデータ','데모 데이터'],['自動同步','Auto sync','自動同期','자동 동기화'],['已暫停同步','Sync paused','同期停止中','동기화 정지'],
    ['顯示與提醒','Display & alerts','表示と通知','표시 및 알림'],['保持最上層','Always on top','最前面に表示','항상 위에 표시'],['用量達 90% 時提醒','Alert at 90% usage','使用量90%で通知','사용량 90% 알림'],['監控來源','Sources','監視ソース','모니터링 소스'],['Google 配額來源','Google quota source','Google 利用枠ソース','Google 할당량 소스'],
    ['Antigravity（個人版）','Antigravity (personal)','Antigravity（個人）','Antigravity (개인)'],['Code Assist（企業版）','Code Assist (enterprise)','Code Assist（法人）','Code Assist (기업)'],
    ['拖拉服務圖示或卡片標題可排序；左側把手移動整座島。Ctrl / ⌘ + Alt + Q 隱藏或顯示。','Drag icons or card headings to reorder. Use the left grip to move. Ctrl / ⌘ + Alt + Q toggles visibility.','アイコンやカード見出しをドラッグして並べ替え、左のハンドルで移動。Ctrl / ⌘ + Alt + Q で表示切替。','아이콘이나 카드 제목을 드래그해 정렬하고 왼쪽 핸들로 이동하세요. Ctrl / ⌘ + Alt + Q로 표시를 전환합니다.'],
    ['隱藏到系統匣','Hide to tray','トレイに隠す','트레이로 숨기기'],['結束','Quit','終了','종료'],['結束 Quota Pebble','Quit Quota Pebble','Quota Pebble を終了','Quota Pebble 종료'],['顯示動態島','Show island','アイランドを表示','아일랜드 표시'],['繼續更新','Resume updates','更新を再開','업데이트 재개'],['暫停更新','Pause updates','更新を停止','업데이트 정지'],
    ['資料來源','Data source','データソース','데이터 소스'],['Claude 授權碼','Claude authorization code','Claude 認証コード','Claude 인증 코드'],['貼上瀏覽器授權頁提供的授權碼','Paste the code from the authorization page','認証ページのコードを貼り付け','인증 페이지의 코드를 붙여넣으세요'],['完成連接並同步','Connect & sync','接続して同期','연결 및 동기화'],['重新開啟授權頁 ↗','Reopen authorization ↗','認証ページを開く ↗','인증 페이지 다시 열기 ↗'],['官方說明 ↗','Official docs ↗','公式ドキュメント ↗','공식 문서 ↗'],['安裝官方 CLI ↗','Install official CLI ↗','公式 CLI をインストール ↗','공식 CLI 설치 ↗'],
    ['展開配額面板','Expand quota panel','利用枠パネルを開く','할당량 패널 펼치기'],['收合配額面板','Collapse quota panel','利用枠パネルを閉じる','할당량 패널 접기'],['收合','Collapse','閉じる','접기'],['設定','Settings','設定','설정'],['顯示設定','Show settings','設定を表示','설정 표시'],['配額顯示方式','Quota display mode','利用枠の表示方法','할당량 표시 방식'],['重新整理配額','Refresh quota','利用枠を更新','할당량 새로고침'],['更新配額（尊重服務冷卻時間）','Refresh (respects cooldown)','更新（待機時間を尊重）','새로고침 (대기 시간 준수)'],
    ['拖曳移動整座動態島','Drag to move island','ドラッグして移動','드래그해 이동'],['拖曳移動動態島','Drag to move island','ドラッグして移動','드래그해 이동'],['拖曳調整卡片順序','Drag to reorder cards','ドラッグして並べ替え','드래그해 카드 정렬'],['拖曳排序；Alt + 左右鍵也可排序','Drag or Alt + arrows to reorder','ドラッグまたは Alt + 左右キーで並べ替え','드래그 또는 Alt + 좌우 키로 정렬'],
    ['每週','Weekly','毎週','주간'],['重設','Reset','リセット','초기화'],['上次資料','Previous reading','前回のデータ','이전 데이터']
  ];
  const dictionaries=Object.fromEntries(locales.map((locale,i)=>[locale,Object.fromEntries(rows.map(row=>[row[0],row[i]]))]));
  function normalizeLocale(value){return locales.includes(value)?value:'zh-TW';}
  function translate(value,locale='zh-TW'){
    locale=normalizeLocale(locale);if(locale==='zh-TW'||!value)return value;
    const text=String(value),dict=dictionaries[locale],index=locales.indexOf(locale)-1;
    if(dict[text])return dict[text];
    const limitNote='目前限制的是配額查詢，不代表已登出。可登入或更新授權；重新登入不會解除限流。';
    if(text.startsWith(limitNote))return dict[limitNote]+translate(text.slice(limitNote.length).replace(/。$/,''),locale);
    const patterns=[
      [/^(\d+) 分鐘前同步$/,n=>[`${n}m ago`,`${n}分前`,`${n}분 전`]],
      [/^(\d+) 小時前同步$/,n=>[`${n}h ago`,`${n}時間前`,`${n}시간 전`]],
      [/^(\d+) 分鐘後重設$/,n=>[`Resets in ${n}m`,`${n}分後リセット`,`${n}분 후 초기화`]],
      [/^(\d+) 小時 (\d+) 分後重設$/,(h,m)=>[`Resets in ${h}h ${m}m`,`${h}時間${m}分後リセット`,`${h}시간 ${m}분 후 초기화`]],
      [/^(\d+) 天 (\d+) 小時後重設$/,(d,h)=>[`Resets in ${d}d ${h}h`,`${d}日${h}時間後リセット`,`${d}일 ${h}시간 후 초기화`]],
      [/^約 (\d+) 分鐘後自動重試$/,n=>[`Retry in ~${n}m`, `約${n}分後に再試行`,`약 ${n}분 후 재시도`]],
      [/^(\d+) 小時 (\d+) 分後自動重試$/,(h,m)=>[`Retry in ${h}h ${m}m`,`${h}時間${m}分後に再試行`,`${h}시간 ${m}분 후 재시도`]],
      [/^登入 (.+)（管理授權） →$/,p=>[`Sign in to ${p} →`,`${p} 認証を管理 →`,`${p} 인증 관리 →`]],
      [/^登入 (.+) 並同步 →$/,p=>[`Sign in to ${p} →`,`${p} にログイン →`,`${p} 로그인 →`]],
      [/^連接你的 (.+) 帳號以讀取配額資訊。$/,p=>[`Connect your ${p} account to read quota.`,`${p} アカウントを接続して利用枠を取得します。`,`${p} 계정을 연결하여 할당량을 읽습니다.`]],
      [/^(\d+(?:\.\d+)?) 小時$/,n=>[`${n} hours`,`${n}時間`,`${n}시간`]],
      [/^(\d+) 天$/,n=>[`${n} days`,`${n}日`,`${n}일`]],
      [/^(.+) 配額即將用完$/,p=>[`${p} quota running low`,`${p} 利用枠が残りわずか`,`${p} 할당량 부족`]],
      [/^(.+) 已使用 (\d+)%$/,(p,n)=>[`${p}: ${n}% used`,`${p}: ${n}% 使用済み`,`${p}: ${n}% 사용`]]
    ];
    for(const [pattern,format] of patterns){const match=text.match(pattern);if(match)return format(...match.slice(1))[index];}
    // Compose longer messages from known phrases, preserving provider names and numbers.
    let result=text,residue=text;
    for(const key of Object.keys(dict).sort((a,b)=>b.length-a.length))if(key.length>1){result=result.split(key).join(dict[key]);residue=residue.split(key).join('');}
    if(/[\u3400-\u9fff]/.test(residue)){
      if(/429|限制查詢|查詢頻率/.test(text))return ['Quota requests rate-limited. You can sign in; this does not clear the cooldown.','利用枠の取得は制限中です。ログインしても待機時間は解除されません。','할당량 요청이 제한되었습니다. 로그인해도 대기 시간은 해제되지 않습니다.'][index];
      if(/授權碼|code/i.test(text))return ['Complete authorization using the browser code.','ブラウザーのコードで認証を完了してください。','브라우저 코드로 인증을 완료하세요.'][index];
      if(/CLI/.test(text))return ['Check the official CLI installation and sign-in.','公式 CLI のインストールとログインを確認してください。','공식 CLI 설치 및 로그인을 확인하세요.'][index];
      if(/登入|授權|帳號/.test(text))return ['Complete sign-in in your browser. If it failed, try again.','ブラウザーでログインしてください。失敗した場合は再試行してください。','브라우저에서 로그인하세요. 실패하면 다시 시도하세요.'][index];
      return ['Quota service unavailable. Check the connection or retry later.','利用枠サービスを利用できません。接続を確認するか、後で再試行してください。','할당량 서비스를 사용할 수 없습니다. 연결을 확인하거나 나중에 다시 시도하세요.'][index];
    }
    return result;
  }
  function localizeDocument(document,locale){
    document.documentElement.lang=normalizeLocale(locale);
    const cache=localizeDocument.cache??=new WeakMap();
    const walker=document.createTreeWalker(document.body,4);
    for(let node;node=walker.nextNode();){
      if(node.parentElement.closest('script,style,#language,#language-popover,[data-localized-text]'))continue;
      const old=cache.get(node),original=old&&node.nodeValue===old.output?old.original:node.nodeValue;
      const output=translate(original.trim(),locale);
      const value=original.replace(original.trim(),output);
      cache.set(node,{original,output:value});node.nodeValue=value;
    }
    for(const el of document.querySelectorAll('[title],[aria-label],[placeholder]')){
      if(el.closest?.('[data-localized-text]'))continue;
      const old=cache.get(el)||{};
      for(const attr of ['title','aria-label','placeholder'])if(el.hasAttribute(attr)){
        if(attr==='title'&&el.hasAttribute('data-localized-title'))continue;
        const value=el.getAttribute(attr),entry=old[attr];
        const original=entry&&entry.output===value?entry.original:value;
        const output=translate(original,locale);el.setAttribute(attr,output);old[attr]={original,output};
      }
      cache.set(el,old);
    }
  }
  const api={locales,dictionaries,normalizeLocale,translate,localizeDocument};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.QuotaI18n=api;
})(globalThis);
