# Requirements Document

要件定義書

## Introduction

AI Team Planner は、社内の従業員が翌週の勤務予定（出社／在宅）を登録し、チーム全体の勤務状況をカレンダー形式で確認できる Web システムである。管理者は全体の勤務状況をダッシュボードで把握でき、さらに AI 分析機能により、特定日の出社人員の過不足に関する警告や、出社／在宅パターンの要約を受け取ることができる。

本システムは以下の技術スタックを前提とする。

- **Frontend**: React、TypeScript、Vite、TailwindCSS
- **Backend**: NestJS、TypeScript
- **Database**: PostgreSQL
- **認証**: AWS Cognito
- **インフラ**: Docker、AWS EC2

スコープ外機能（本システムでは実装しない機能）は次のとおりである。

- Microsoft Teams 連携
- Outlook 連携
- 座席予約機能

## Glossary

- **System（システム）**: AI Team Planner 全体を指す。フロントエンド、バックエンド、データベースを含む Web システム。
- **Auth_Service（認証サービス）**: AWS Cognito を用いてユーザー認証を担うシステム構成要素。
- **Schedule_Service（勤務予定サービス）**: 従業員の出社／在宅予定の登録・更新・照会を担うバックエンド構成要素。
- **Calendar_View（チームカレンダー）**: チーム全体の勤務予定を週単位で表示するフロントエンド画面。
- **Admin_Dashboard（管理者ダッシュボード）**: 管理者が全体の勤務状況を確認する画面。
- **AI_Analyzer（AI分析エンジン）**: 出社人員の過不足判定および勤務パターン要約を生成するバックエンド構成要素。
- **Employee（一般ユーザー）**: 自身の勤務予定を登録・照会する権限を持つ従業員。
- **Administrator（管理者）**: 全体の勤務状況の確認、および管理者ダッシュボード・AI分析結果の閲覧権限を持つユーザー。
- **Work_Location（勤務区分）**: 勤務予定の種別。値は「出社（office）」または「在宅（remote）」のいずれか。
- **Target_Week（対象週）**: 勤務予定を登録する対象となる翌週（月曜日から日曜日までの7日間）。
- **Occupancy_Count（出社人員数）**: 特定日に「出社」を登録した従業員の人数。
- **Upper_Threshold（出社上限しきい値）**: 出社人員数の警告判定に用いる上限値。管理者が設定可能な数値。
- **Lower_Threshold（出社下限しきい値）**: 出社人員数の警告判定に用いる下限値。管理者が設定可能な数値。

## Requirements

### Requirement 1: ユーザー認証（ログイン）

**User Story:** 従業員として、AWS Cognito によるログインを行いたい。それにより、認可された利用者だけがシステムを利用できるようにするため。

#### Acceptance Criteria

1. WHEN 有効な認証トークンを保持しないユーザーがシステムの保護されたページにアクセスした場合、THE System SHALL 元のアクセス先を保持したうえでログイン画面へリダイレクトする
2. WHEN ユーザーが登録済みのメールアドレスおよびパスワードを入力してログインを要求した場合、THE Auth_Service SHALL AWS Cognito で認証を行い、認証成功時に認証トークンを発行し、認証要求受付から5秒以内に結果を返す
3. IF ユーザーが登録済みでないメールアドレス、または登録済みメールアドレスと一致しないパスワードを入力してログインを要求した場合、THEN THE Auth_Service SHALL 認証トークンを発行せず、認証に失敗したことを示すエラーメッセージを返す
4. IF 同一ユーザーの連続したログイン失敗回数が5回に達した場合、THEN THE Auth_Service SHALL 当該ユーザーのログインを15分間拒否し、アカウントが一時的にロックされたことを示すメッセージを返す
5. IF AWS Cognito が応答しない、または認証処理でシステムエラーが発生した場合、THEN THE Auth_Service SHALL 認証トークンを発行せず、一時的に認証できない旨を示すエラーメッセージを返す
6. WHEN 認証トークンの有効期限が切れた状態でユーザーが保護されたリソースにアクセスした場合、THE System SHALL 元のアクセス先を保持したうえでログイン画面へリダイレクトする
7. WHEN 認証済みユーザーがログアウトを要求した場合、THE Auth_Service SHALL 認証トークンを無効化し、ログイン画面へ遷移する

### Requirement 2: ユーザー勤務予定登録

**User Story:** 従業員として、翌週の出社／在宅の予定を登録したい。それにより、チームに自分の勤務予定を共有するため。

#### Acceptance Criteria

1. WHEN 認証済みの Employee が Target_Week（翌週の月曜日から日曜日）の特定日に対して Work_Location を登録した場合、THE Schedule_Service SHALL その勤務予定を保存し、登録が完了したことを示す確認応答を返す
2. THE Work_Location SHALL 「出社（office）」または「在宅（remote）」のいずれかの値のみをとる
3. IF Employee が「出社（office）」および「在宅（remote）」以外の値を Work_Location として登録しようとした場合、THEN THE Schedule_Service SHALL 登録を拒否し、許容される値を示すエラー内容を返し、既存の勤務予定を変更しない
4. WHEN Employee が既に登録済みの勤務予定に対して別の Work_Location を登録した場合、THE Schedule_Service SHALL 該当日の勤務予定を新しい値へ更新する
5. IF Employee が Target_Week（翌週の月曜日から日曜日）の範囲外の日付に対して勤務予定を登録しようとした場合、THEN THE Schedule_Service SHALL 登録を拒否し、許容される対象範囲（翌週の月曜日から日曜日）を示すエラー内容を返し、既存の勤務予定を変更しない
6. WHEN Employee が自身の勤務予定の照会を要求した場合、THE Schedule_Service SHALL その Employee の Target_Week（翌週の月曜日から日曜日）の各日について、登録済みの Work_Location、または未登録であることを区別できる形で返す
7. THE Schedule_Service SHALL 各 Employee について Target_Week の同一日に対する Work_Location を1件のみ保持する

### Requirement 3: チームカレンダー照会

**User Story:** 従業員として、チーム全体の勤務予定をカレンダーで確認したい。それにより、出社日を調整できるようにするため。

#### Acceptance Criteria

1. WHEN 認証済みユーザーが Calendar_View を開いた場合、THE System SHALL Target_Week（週の起点日から連続する7日間）の各日について、チームメンバーごとの Work_Location を3秒以内に表示する
2. WHEN 認証済みユーザーが Calendar_View を開いた場合、THE Calendar_View SHALL Target_Week の各日について、当該日に勤務地が「出社」として登録されているメンバー数（Occupancy_Count）を数値で表示する
3. WHEN 表示対象のチームが選択された場合、THE Calendar_View SHALL 選択されたチームに所属するメンバーの勤務予定のみを表示する
4. IF Calendar_View を開いた時点で表示対象のチームが選択されていない場合、THEN THE Calendar_View SHALL 認証済みユーザーが所属するチームを既定の表示対象として勤務予定を表示する
5. IF 表示対象の週に登録済みの勤務予定が1件も存在しない場合、THEN THE Calendar_View SHALL 勤務予定が未登録である旨を示すメッセージを表示する
6. IF 特定のチームメンバーについて Target_Week のいずれかの日の勤務予定が登録されていない場合、THEN THE Calendar_View SHALL 当該メンバーの当該日を「未登録」を示す表示にする
7. IF 勤務予定データの取得に失敗した場合、THEN THE Calendar_View SHALL 取得失敗である旨を示すエラーメッセージを表示し、既存の表示内容を変更しない

### Requirement 4: 管理者ダッシュボード

**User Story:** 管理者として、全体の勤務状況をダッシュボードで確認したい。それにより、出社状況を把握し運用判断を行うため。

#### Acceptance Criteria

1. WHEN 認証済みの Administrator が Admin_Dashboard を開いた場合、THE System SHALL Target_Week の各日についての Occupancy_Count を 3 秒以内に表示する
2. IF ログインユーザーが Administrator 権限を持たない場合、THEN THE System SHALL Admin_Dashboard へのアクセスを拒否し、権限が不足している旨を示すメッセージを表示する
3. WHEN Administrator が 0 以上 100 以下の整数値を Upper_Threshold または Lower_Threshold として設定した場合、THE System SHALL 設定された値を保存する
4. IF Administrator が設定した Upper_Threshold または Lower_Threshold が 0 未満もしくは 100 を超える場合、または Upper_Threshold が Lower_Threshold 以下となる場合、THEN THE System SHALL 当該設定を保存せず、入力値が不正である旨を示すメッセージを表示し、変更前の値を保持する
5. THE Admin_Dashboard SHALL Target_Week の全体の出社率および在宅率を 0% から 100% の範囲でパーセント値として表示する
6. WHEN Administrator が特定日を選択した場合、THE Admin_Dashboard SHALL 該当日に出社を登録した Employee の一覧を表示する
7. IF Administrator が選択した特定日に出社を登録した Employee が 1 人も存在しない場合、THEN THE Admin_Dashboard SHALL 出社登録者が存在しない旨を示すメッセージを表示する

### Requirement 5: AI分析機能

**User Story:** 管理者として、勤務予定に関する AI 分析結果を受け取りたい。それにより、出社人員の過不足や勤務傾向を把握するため。

#### Acceptance Criteria

1. WHEN Administrator が AI 分析の実行を要求した場合、THE AI_Analyzer SHALL Target_Week の各日（7日分）について Occupancy_Count を評価し、要求受付から30秒以内に評価を完了する
2. IF ある日の Occupancy_Count が Upper_Threshold 以上である場合、THEN THE AI_Analyzer SHALL 該当日を出社人員過多として、対象日付と当該 Occupancy_Count を含む警告メッセージを生成する
3. IF ある日の Occupancy_Count が Lower_Threshold 以下である場合、THEN THE AI_Analyzer SHALL 該当日を出社人員過少として、対象日付と当該 Occupancy_Count を含む警告メッセージを生成する
4. WHEN AI 分析が完了した場合、THE AI_Analyzer SHALL Target_Week の各日ごとの出社人数および在宅人数を含む出社／在宅パターンの要約を生成する
5. WHEN AI 分析結果が生成された場合、THE Admin_Dashboard SHALL 生成されたすべての警告メッセージおよびパターン要約を表示する
6. IF AI 分析の対象となる勤務予定が1件も存在しない場合、THEN THE AI_Analyzer SHALL 分析対象データが存在しない旨のメッセージを返し、警告メッセージおよびパターン要約を生成しない
7. IF AI 分析処理が完了できず失敗した場合、THEN THE AI_Analyzer SHALL 分析に失敗した旨を示すエラーメッセージを返し、既存の勤務予定データを変更せずに保持する
