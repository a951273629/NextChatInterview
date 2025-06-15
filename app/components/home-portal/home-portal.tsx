"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMobileScreen } from "../../utils";
import { Path } from "../../constant";
import styles from "./home-portal.module.scss";
import { IconButton } from "../button";
import { useSwitchTheme } from "../home";
import YangIcon from "@/app/icons/yang_64x64.svg";
import PreparationResumesUpload from "../personal-set/preparation-resumes-upload";
export function HomePortal() {
  const navigate = useNavigate();
  const isMobileScreen = useMobileScreen();
  useSwitchTheme();
  const [showResumeUpload, setShowResumeUpload] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleStartInterview = () => {
    navigate(Path.Chat);
  };

  const handleLogin = () => {
    navigate(Path.Login);
  };
  const handleAssistant = () => {
    // navigate(Path.Assistant);
    window.open("https://www.yuque.com/baolongzhanshi798/iv5s1m/ybqihfziy4mhn1gz?singleDoc# 《面试羊 AI面试助手 说明书》", "_blank");
  };
  const handleBuy = () => {
    window.open("https://m.tb.cn/h.h1iCB2J?tk=nSR3VHm0tUx", "_blank");
  }
  const handeleUpload = () => {
    // 修改为打开简历上传模态框，而不是导航到设置页面
    openResumeUpload();
  };
  const handlePortal = () => {
    navigate(Path.HomePortal);
  }

  // 打开简历上传模态框
  const openResumeUpload = () => {
    setShowResumeUpload(true);
  };

  // 关闭简历上传模态框
  const closeResumeUpload = () => {
    setShowResumeUpload(false);
  };

  // 切换移动端菜单显示状态
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  // 关闭移动端菜单
  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };


  return (
    <div className={styles.container}>
      {/* 顶部导航栏 */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            {/* <span className={styles.logoIcon}>🔥</span> */}
            <YangIcon />
            <span className={styles.logoText}>面试羊 AI</span>
          </div>

          {!isMobileScreen && (
            <nav className={styles.nav}>
              <a onClick={handlePortal} className={styles.navLink}>首页</a>
              <a onClick={handlePortal} className={styles.navLink}>上传简历</a>
              <a onClick={handleBuy} className={styles.navLink}>价格</a>
              <a onClick={handleAssistant} className={styles.navLink}>帮助文档</a>
            </nav>
          )}

          <div className={styles.headerActions}>
            {!isMobileScreen && (
              <>
                <IconButton
                  text="上传简历"
                  onClick={handeleUpload}
                  className={styles.actionButton}
                />
                <IconButton
                  text="帮助文档"
                  onClick={handleAssistant}
                  className={styles.loginButton}
                />
              </>
            )}
            {isMobileScreen && (
              <IconButton
                text="菜单"
                onClick={toggleMobileMenu}
                className={styles.menuButton}
              />
            )}
          </div>
        </div>
      </header>

      {/* 移动端菜单下拉列表 */}
      {isMobileScreen && showMobileMenu && (
        <div className={styles.mobileMenuOverlay} onClick={closeMobileMenu}>
          <div className={styles.mobileMenuContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.mobileMenuItem}>
              <IconButton
                text="上传简历"
                onClick={() => {
                  openResumeUpload();
                  closeMobileMenu();
                }}
                className={styles.mobileMenuButton}
              />
            </div>
            <div className={styles.mobileMenuItem}>
              <IconButton
                text="帮助文档"
                onClick={() => {
                  handleAssistant();
                  closeMobileMenu();
                }}
                className={styles.mobileMenuButton}
              />
            </div>
          </div>
        </div>
      )}

      {/* 主要内容区域 */}
      <section className={styles.main}>

        <div className={styles.heroContent}>
          <div className={styles.titleSection}>
            <h1 className={styles.title}>面试羊 AI</h1>
            <h2 className={styles.subtitle}>AI 时代面试助手</h2>
            <p className={styles.description}>
              先用 AI，先拿 Offer，干掉八股，干掉测评
              <br />
              各行各业都在用
              <br />



            </p>
          </div>

          <div className={styles.actionSection}>
            <IconButton
              text="开始面试"
              onClick={handleStartInterview}
              className={styles.startButton}
            />
            <span className={styles.learnMore}>了解更多 →</span>
          </div>

          <div className={styles.supportInfo}>
            <div className={styles.supportItem}>
              <span>支持</span>
              <span>浏览器运行免下载,支持谷歌,Edge,Safari,火狐 浏览器</span>
            </div>
            {/* <div className={styles.supportItem}>
                <span>支持端</span>
                <span>Windows 10 / Mac OS 11+ / 浏览器端 / 手机端</span>
              </div> */}
          </div>
        </div>

        {/* 预览图片展示区域 */}
        <div className={styles.previewSection}>
          <div className={styles.previewContainer}>
            <div className={styles.previewCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>双开同步互通，吊打技术面试</span>
              </div>
              <img
                src="./msy_1.jpg"
                alt="面试羊"
                className={styles.previewImage}
              />
            </div>

            <div className={styles.previewCard}>
              <img
                src="./msy_2.jpg"
                alt="面试羊"
                className={styles.previewImage}
              />
            </div>

            <div className={styles.previewCard}>
              <img
                src="./msy_3.jpg"
                alt="面试羊"
                className={styles.previewImage}
              />
            </div>
          </div>

          <div className={styles.additionalInfo}>
            {/* <p>手机扫码打开 app.offerin.cn</p> */}
            <p>双端互联</p>
          </div>
        </div>

      </section>

      {/* FAQ部分 */}
      <section className={styles.faqSection}>
        <div className={styles.faqContainer}>
          <h2 className={styles.faqTitle}>你或许想问......</h2>
          <div className={styles.faqGrid}>
            <div className={styles.faqItem}>
              <h3>哪些岗位可以用？</h3>
              <p>只要您的岗位支持在线面试和笔试，都可以使用我们的工具。包括但不限于：程序员、产品经理、设计师、商业分析、金融、财会、人力资源等等任何岗位。</p>
            </div>
            <div className={styles.faqItem}>
              <h3>怎么使用呢？</h3>
              <p>【提供麦克风语音识别】 【单机双屏】 【双端同步互联】 三种面试场景应用模式，功能灵活强大并且价格还是同类最低，是您的不二之选。</p>
            </div>
            <div className={styles.faqItem}>
              <h3>考虑使用安全吗？</h3>
              <p>绝对安全！事实上，我们并不会存储您的任何面试记录，所有数据都存储在您的本地，我们也不会获取登录鉴权之外的任何个人信息，隐私安全是我们服务的重中之重。</p>
            </div>
            <div className={styles.faqItem}>
              <h3>我们的优势？</h3>
              <p>拥有市面所有AI面试面试工具中 最先进的模型【GPT-4.5 preview genmin2.5pro preview】，多种语言识别【Azure Speech】 。</p>
            </div>
          </div>
        </div>
      </section>

      {/* 统计数据部分 */}
      <section className={styles.statsSection}>
        <div className={styles.statsContainer}>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>20000+</div>
              {/* <div className={styles.statDot}></div> */}
              <div className={styles.statLabel}>用户使用 面试羊AI 服务成功通过考试</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>800ms</div>
              <div className={styles.statLabel}>全场AI真实体验</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>50ms</div>
              <div className={styles.statLabel}>高效测试响应</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>92%</div>
              <div className={styles.statLabel}>通过率提升</div>
            </div>
          </div>
        </div>
      </section>

      {/* 专业团队部分 */}
      <section className={styles.teamSection}>
        <div className={styles.teamContainer}>
          <div className={styles.teamContent}>
            <span className={styles.teamBadge}>我们是谁？</span>
            <h2 className={styles.teamTitle}>专业团队，随时待命</h2>
            <p className={styles.teamDescription}>
              您在使用我们产品的过程中有任何问题，随时随地都可以联系我们
            </p>
            <IconButton
              text="联系我们"
              onClick={() => { }}
              className={styles.teamButton}
            />
          </div>
        </div>
      </section>

      {/* 底部信息 */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerMain}>
            <div className={styles.footerBrand}>
              <div className={styles.footerLogo}>
                <YangIcon />
                <span>面试羊 AI</span>
              </div>
              <p className={styles.footerSlogan}>竭诚为你提供便用的AI面试助手</p>
            </div>

            {!isMobileScreen && (
              <div className={styles.footerLinks}>
                <div className={styles.footerColumn}>
                  <h4>产品</h4>
                  <ul>
                    <li><a onClick={handlePortal}>AI面试助手</a></li>
                    <li><a onClick={handlePortal}>简历优化</a></li>
                    <li><a onClick={handlePortal}>面试模拟</a></li>
                    <li><a onClick={handlePortal}>求职指导</a></li>
                  </ul>
                </div>

                <div className={styles.footerColumn}>
                  <h4>服务</h4>
                  <ul>
                    <li><a onClick={handlePortal}>技术支持</a></li>
                    <li><a onClick={handlePortal}>用户反馈</a></li>
                    <li><a onClick={handlePortal}>帮助文档</a></li>
                    <li><a onClick={handlePortal}>联系我们</a></li>
                  </ul>
                </div>

                <div className={styles.footerColumn}>
                  <h4>关于</h4>
                  <ul>
                    <li><a onClick={handlePortal}>关于我们</a></li>
                    <li><a onClick={handlePortal}>团队介绍</a></li>
                    <li><a onClick={handlePortal}>加入我们</a></li>
                    <li><a onClick={handlePortal}>合作伙伴</a></li>
                  </ul>
                </div>
              </div>)}

          </div>

          <div className={styles.footerBottom}>
            <div className={styles.footerCopyright}>
              <span>© 2025 面试羊 AI. 版权所有</span>
              <span>陇ICP备2024009358号</span>
            </div>
            <div className={styles.footerSocial}>
              <span>试用此产品的反馈建议</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 条件渲染简历上传模态框 */}
      {showResumeUpload && (
        <PreparationResumesUpload onClose={closeResumeUpload} />
      )}
    </div>
  );
} 