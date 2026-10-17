# Dev history

## 2026-10-17 — B7 卧室装配、网页与 MuJoCo 同步

按已确认的 `bedroom-furniture-concepts-v1/final/01-approved-floor-plan-B7.png`，装配此前验收的 23 个 Seed3D → Blender 单品/部件。没有重新生成付费高模。原始交付资产保留；本次调整写在 `bedroom-assembly-b7-v1/`，所有尺寸均为场景估计值，单位米。

### 布局与模型

- 西墙向东收 0.35 m，南墙落在 Y=-3.61 m；地板 4.80 × 4.60 m，房间内净宽约 4.64 m。窗户只随西墙移动 X，保留原南北位置与百叶机构。
- Twin 床沿南墙，床头在西；床架 2.14 × 1.13 m，床垫 1.91 × 0.965 m。床头柜位于西墙、床和窗之间，抽屉向东打开。
- 吉他在垃圾桶西面，两者靠近桌子左侧。东墙从北向南为原立式灯、书架、衣帽架、房门；书架向南移 0.60 m，立式灯位置不变。
- 床尾南墙开 closet 门洞，门板向东平移 0.94 m，藏在 closet 一侧。没有创建 closet 或卫生间内部。
- 部件经过实体尺度校准、朝向和装配间隙修正：内桶、抽屉、床品、门框与门板均独立。床架与踢脚线留出间隙。新资产为已减面的三角网格，不宣称四边形拓扑。
- 修复同步时发现的旧主机与桌脚干涉：主机从上版位置向南移 0.45 m，网页与 MuJoCo 使用同一中心位置。MuJoCo 的旧显示器简化支架靠墙后增加安全转角限位 [-0.15, 0.25] rad；网页保留既有屏幕/机械臂路径防穿模逻辑。

### 互动与资产

- 网页新增 9 个控制：脚踏桶盖、内桶取出、床头抽屉、床头灯、closet 推拉门、90° 房门、取下吉他、取下外套、拿起蜜桃猫。加上既有机构，共 28 个主互动入口。
- 桶盖与踏板联动；只有盖子完全打开才能提内桶，内桶放回后才能关盖。全部复位包含此依赖。门、抽屉、挂件都保留独立转轴/滑动部件。
- 保留现有照片墙及换图/凑近看、软木底板、耳机海绵、桌面配件、独立四本书、书架内容、墙纸和切墙功能。新增南墙与门组也支持视角切墙。
- 新网页卧室 GLB 约 9.8 MB，扩展层约 3.4 MB，使用 WebP 与 Meshopt；位置保留 float32。资产按 SHA-256 引用。当前文件名以网页各 manifest 为准。
- MuJoCo 使用同一装配清单导出的局部坐标 OBJ/纹理，增加独立 slide/hinge、位置执行器和分段碰撞体；门洞、抽屉与空心桶不使用封死内部的整块凸包。已有书架/窗户/立式灯也同步到物理场景。
- 新增 `sim.bedroom.set('nightstand.drawer', 1)` 等同名归一化接口；台灯开关控制真实灯光，内桶安全锁依据实际关节位置。外部机器人接触保持启用；吉他/支架、外套/衣帽架等内部简化代理有明确成对排除，真实网格运动另做 BVH 验证。

### 验证与边界

- `sweep-review.json`：23 个新增部件互检、与墙/窗/书架/立式灯/桌面的表面检查，9 条运动轨迹共 1,042 个采样状态，无三角表面交叉。每条轨迹覆盖中间状态，内桶按桶盖全开状态验证。
- `physics-review.json`：10 组机构（包括既有书架两扇门）共 1,010 个运动采样；没有大于 1 mm 的 B7 相关穿透。2 秒动态运行，状态有限、无 MuJoCo 警告。真实接触使用简化几何，质量/摩擦等为估计参数。
- 全部四种房间入口和独立机器人入口可编译。34 项生成/机构测试通过，包含四场景 10 秒零控制稳定性、所有关节限位及既有机构端点检查。27 项运行接口/控制器回归通过；新增 B7 的 4 项接口测试通过。
- 网页 TypeScript 检查和 139 项测试通过；浏览器检查模型加载、抽屉、桶盖/内桶、灯、门、照片墙及语言控制。
- 原工作台碰撞预算仍为 500 个；B7 增加独立的 160 个上限，当前总碰撞体 519 个，新增部分采用基本几何。未更改既有穿透、限位或稳定性容差。
- 旧机器人任务的两份双种子接触报告绑定旧场景 SHA，保留为历史证据，没有冒充 B7 的新验收。此次未重跑完整机器人自主任务基准，也没有沿用旧的全项目 acceptance 报告作为新场景结论。

### 当前入口

- 完整 Blender：`bedroom-assembly-b7-v1/workstation-bedroom-B7.blend`
- 米制装配与关节契约：`bedroom-assembly-b7-v1/assembly-manifest.json`
- 网页：`web/public/room/bedroom/manifest.json` 与 `web/public/room/expansion/manifest.json`
- MuJoCo：`workstation-physics-mujoco/mjcf/room_full.xml`、`room_training.xml` 及对应 `*_stretch3.xml`
- 新物理模块与接口：`workstation-physics-mujoco/scripts/bedroom_b7.py`、`workstation_sim/bedroom.py`
- 全景、平面与仿真截图：`bedroom-assembly-b7-v1/renders/`

复现顺序：`build_assembly.py` → `configure_physics.py` → `finish_scene.py` → `export_physics.py` → `install-web.mjs` → `generate_mjcf.py --compile` → `verify_sweeps.py` / `verify_physics.py`。Blender 脚本使用项目中的固定绝对路径，原高模/低模交付目录只读复用。

公开站点发布结果在完成发布后补记。
