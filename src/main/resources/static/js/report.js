// 리포트 화면의 상호작용: 강점 더 보기, 위젯 내보내기 대화상자(테마 전환, 마크다운 복사).
(() => {
  const ACTIVE_THEME_CLASSES = ['bg-[#005ab4]', 'text-white'];
  const INACTIVE_THEME_CLASSES = ['text-[#414753]', 'hover:bg-[#e0e2eb]', 'hover:text-[#181c22]'];

  function initStrengthsToggle() {
    const button = document.getElementById('strengths-toggle');
    if (!button) return;

    const extras = document.querySelectorAll('#strengths-list > li[hidden]');
    const label = document.getElementById('strengths-toggle-label');
    const icon = document.getElementById('strengths-toggle-icon');
    const moreText = label.textContent;

    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      extras.forEach((item) => { item.hidden = !expanded; });
      button.setAttribute('aria-expanded', String(expanded));
      label.textContent = expanded ? '접기' : moreText;
      icon.classList.toggle('rotate-180', expanded);
    });
  }

  function initWidgetDialog() {
    const dialog = document.getElementById('widget-dialog');
    if (!dialog) return;

    const widgetUrl = dialog.dataset.widgetUrl;
    const reportUrl = dialog.dataset.reportUrl;
    const preview = document.getElementById('widget-preview');
    const link = document.getElementById('widget-link');
    const markdown = document.getElementById('widget-markdown');
    const copyButton = document.getElementById('widget-copy');
    const themeButtons = dialog.querySelectorAll('[data-widget-theme]');
    let theme = 'light';
    let copiedTimer;

    const themedUrl = () => `${widgetUrl}?theme=${theme}`;

    // 캐시된 이미지가 아니라 지금 서버가 주는 위젯을 보여주려고 미리보기 주소에만 값을 붙인다.
    function refreshPreview() {
      preview.src = `${themedUrl()}&preview=${Date.now()}`;
    }

    function render() {
      link.href = themedUrl();
      markdown.textContent = `[![Pinned Signal profile widget](${themedUrl()})](${reportUrl})`;
      themeButtons.forEach((button) => {
        const active = button.dataset.widgetTheme === theme;
        button.classList.remove(...(active ? INACTIVE_THEME_CLASSES : ACTIVE_THEME_CLASSES));
        button.classList.add(...(active ? ACTIVE_THEME_CLASSES : INACTIVE_THEME_CLASSES));
      });
      refreshPreview();
    }

    async function copyMarkdown() {
      const text = markdown.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      copyButton.textContent = '복사됨';
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { copyButton.textContent = '복사'; }, 1600);
    }

    document.getElementById('widget-open').addEventListener('click', () => {
      refreshPreview();
      document.body.classList.add('overflow-hidden');
      dialog.showModal();
    });
    document.getElementById('widget-close').addEventListener('click', () => dialog.close());
    // 대화상자 바깥(backdrop)을 누르면 닫는다. 안쪽 여백은 내용 div가 차지하므로 target이 dialog일 때만 바깥이다.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => document.body.classList.remove('overflow-hidden'));

    themeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        theme = button.dataset.widgetTheme;
        render();
      });
    });
    copyButton.addEventListener('click', copyMarkdown);
  }

  initStrengthsToggle();
  initWidgetDialog();
})();
