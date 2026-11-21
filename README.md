# Codex trong Claude Code · bookingseo

Dùng Claude để phản biện spec, dùng Codex để review code hoặc nhận một việc cụ thể. Lệnh thường chạy ngay trong phiên hiện tại. Với một sửa đổi nhỏ, anh cứ giao việc cho Claude như bình thường.

## Cài trong Claude Code

Cần Node.js 18.18 trở lên và Codex CLI. Nếu đang bật bản upstream, dùng `/plugin disable codex@openai-codex` trước để tránh trùng tên lệnh và chạy hook hai lần.

```text
/plugin marketplace add bookingseo/codex-plugin-cc
/plugin install codex@bookingseo-codex
/reload-plugins
/codex:setup
```

Để thử từ checkout local, chạy `claude --plugin-dir ./plugins/codex` ở gốc repo. Setup kiểm tra Codex CLI và trạng thái đăng nhập. Nếu thiếu CLI, setup có thể đề nghị cài. Nếu cần đăng nhập, dùng `!codex login`. Plugin dùng tài khoản và cấu hình model của Codex CLI hiện tại.

## Chọn lệnh theo việc

| Việc đang làm | Ví dụ trong Claude Code | Kết quả |
| --- | --- | --- |
| Sửa typo hoặc lỗi nhỏ | `Sửa typo trong README` | Claude làm trực tiếp theo quy ước repo. |
| Phản biện spec do Codex soạn | `/codex:critique plans/ten-viec/spec.md` | Claude đọc spec và bằng chứng, đưa một kết luận cho cả mốc. |
| Review thay đổi trước khi merge | `/codex:review --base main` | Codex review ở chế độ chỉ đọc và trả kết quả ngay trong phiên. |
| Tìm nguyên nhân lỗi | `/codex:rescue Tìm nguyên nhân test retry bị lỗi` | Một task Codex chỉ đọc, chạy trực tiếp qua companion. |
| Sửa lỗi đã tìm ra | `/codex:rescue --resume Sửa lỗi vừa tìm và chạy test retry` | Codex tiếp tục task trong phiên Claude này với quyền sửa workspace. |

### Review và phản biện

`/codex:review` dùng reviewer tích hợp của Codex cho thay đổi trong working tree hoặc một nhánh. Để đặt trọng tâm cho lần review, dùng `/codex:adversarial-review --base main kiểm tra khả năng ghi trùng khi retry`. Hai lệnh mặc định đợi kết quả. Thêm `--background` khi anh muốn làm việc khác trong lúc chờ.

Khi cần thiết kế, anh có thể dùng `/codex:rescue Soạn spec chống ghi trùng vào plans/retry/spec.md`, rồi chạy `/codex:critique plans/retry/spec.md`. Claude phản biện ngay trong cuộc trò chuyện hiện tại. Sau khi Codex cập nhật spec, yêu cầu Claude kiểm lại các điểm đã nêu một lần.

### Giao việc và tiếp tục

Khi đã giao nhiều việc trong cùng phiên Claude, mở `/codex:status` và sao chép lệnh `/codex:rescue --from <job-id>` ở dòng của task muốn làm tiếp. Thêm yêu cầu mới phía sau mã job, chẳng hạn:

```text
/codex:rescue --from task-abc123 Sửa lỗi retry vừa tìm thấy và chạy test liên quan
```

Thay `task-abc123` bằng mã đầy đủ của anh. Codex tiếp tục ở lượt mới nhất trong thread của job đó, kể cả khi anh đã làm việc khác sau đó. Quyền ghi phụ thuộc vào yêu cầu lần này. Chỉ những task rescue đã hoàn tất trong cùng workspace và phiên Claude mới có lệnh nối lại.

`/codex:rescue` mở task mới cho yêu cầu độc lập. Dùng `--resume` để tiếp tục task gần nhất của phiên Claude, hoặc `--fresh` để bắt đầu việc mới. Một câu nối tiếp rõ ràng như “tiếp tục sửa lỗi vừa tìm được” cũng được chuyển vào task trước. Khi thiếu phiên hoặc task, lệnh báo lý do. Codex nhận quyền ghi khi yêu cầu có thay đổi file. Có thể chỉ định `--model` (kể cả alias `spark`), `--effort`, `--wait` hoặc `--background`.

Theo dõi việc chạy nền bằng `/codex:status [job-id]`, lấy đầu ra bằng `/codex:result [job-id]`, dừng bằng `/codex:cancel [job-id]`. Để chuyển **lịch sử phiên Claude** sang một thread Codex, dùng `/codex:transfer` rồi tiếp tục bằng lệnh `codex resume <session-id>` mà plugin trả về. Tác vụ rescue chỉ cần nội dung việc được giao.

### Review tự động lúc dừng

Hook review mặc định tắt. Bật cho repo bằng `/codex:setup --enable-review-gate`, tắt bằng `/codex:setup --disable-review-gate`. Khi bật, hook có thể chặn lần dừng đầu để Claude xử lý finding. Khi Claude báo đang tiếp tục từ stop hook, plugin nhường lượt dừng tiếp theo. Muốn kiểm tra lại bản sửa, dùng `/codex:review`.

## Kiểm tra bản fork

```sh
npm ci
npm test
npm run build
npm run check-version
claude plugin validate .
claude plugin validate ./plugins/codex
```

Bộ test dùng Codex giả lập cho các lượt model. Build dùng lệnh `codex app-server generate-ts` của Codex CLI đã cài.

Bản fork từ [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc), phát hành theo Apache-2.0. Xem [LICENSE](LICENSE) và [NOTICE](NOTICE).
