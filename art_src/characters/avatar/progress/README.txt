人物迭代记录 V01–V28
2026-10-26

下载
  图片和视频使用 Git LFS 保存。克隆仓库后执行 git lfs install 和
  git lfs pull，取得完整媒体文件。

视频
  avatar-iterations-v01-v28-clean-1s-4k.mp4     3840×2160 / 30 fps / 28 秒
  avatar-iterations-v01-v28-clean-1s-1080p.mp4  1920×1080 / 30 fps / 28 秒

八个视角同时显示，同步从 V01 推进到 V28，每版停留 1 秒。
统一灰色背景，无边框、标题、视角文字或进度条，只展示人物。
上排为正面、左前、左侧、左后；下排为背面、右后、右侧、右前。
左右按角色自身方向排列。视频无音轨。

归档
  v01/ … v28/views/               每版八张统一机位全身预览，共 224 张
  v01/ … v28/original-previews/   保留的原始预览和细节图，字节未改动
  all-versions-overview.jpg       28 个版本的正面总览，按行从 V01 到 V28
  video-poster.jpg                八宫格视频封面
  index.json                     每版来源、阶段标题、原预览哈希
  archive-verification.json      删除前核对记录
  archive-verification-after-cleanup.json  删除后核对记录
  video-verification.json        视频哈希、帧数、时长和解码检查
  cleanup-report.json            旧版清理范围和统计

所有统一视角预览均在删除前从对应版本的最终 Blender 工程渲染。
采用固定正交相机、人物位置、光照及色彩设置，以便直接比较变化。
渲染过程没有保存或修改原工程。

按用户要求，V01–V27 的旧模型、贴图、源文件、临时文件及备份已清理。
保留 817 张旧版原预览，另保留 75 张 V28 原预览；合计 892 张。
224 张统一视角预览是额外补齐的记录。
V28 最终模型仍在 ../v28/avatar-body-surface-v28.blend，内容哈希不变。

复用
  tools/make_video.py 可用已归档的 views/ 重新制作视频，不需要旧模型。
  它使用 Pillow、FFmpeg；本机 FFmpeg 位于项目 .tools/iteration-video-runtime/。
  tools/verify_archive.py --after-cleanup 可检查保留文件与归档哈希。
  archive_previews.py、render_views.py 和 cleanup_old_versions.ps1 是本次
  归档过程记录；旧版模型已删除，不应把这些步骤当作可重新执行的模型来源。
