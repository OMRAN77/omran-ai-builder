/* قسم الخلفيات — عرض معاينات الخلفيات المتاحة مع اختيار ديناميكي */

async function أظهر_قسم_الخلفيات() {
  const حاوي = document.getElementById('خلفيات-قسم') || document.createElement('div');
  حاوي.id = 'خلفيات-قسم';
  حاوي.innerHTML = '<div class="خلفيات-تحميل">جاري التحضير...</div>';

  if (!document.getElementById('خلفيات-قسم')) {
    document.body.append(حاوي);
  }

  const خلفيات = await window.خلفيات.حضّر_خلفيات();

  حاوي.innerHTML = `
    <div class="خلفيات-رئيسي">
      <h2>الخلفيات المتاحة</h2>
      <div class="خلفيات-شبكة">
        ${خلفيات.map((خ, i) => `
          <div class="خلفية-بطاقة" data-index="${i}">
            <div class="خلفية-صورة" style="
              background-image: url('${خ.صورة}');
              background-size: cover;
              background-position: center;
              background-color: ${خ.ألوان.ابتدائي};
            "></div>
            <div class="خلفية-معلومات" style="
              background-color: ${خ.ألوان.ابتدائي};
              color: ${خ.ألوان.نص_رئيسي};
              border: 2px solid ${خ.ألوان.إطار};
            ">
              <h3 style="color: ${خ.ألوان.نص_رئيسي};">${خ.اسم}</h3>
              <p style="color: ${خ.ألوان.نص_ثانوي};">
                ${خ.علامات.join(', ')}
              </p>
              <button class="خلفية-زر-اختيار" data-index="${i}" style="
                background-color: ${خ.ألوان.زر_بطاقة};
                color: ${خ.ألوان.نص_رئيسي};
                border: 1px solid ${خ.ألوان.إطار};
              ">
                اختيار الخلفية
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // مستمعو الأحداث
  حاوي.querySelectorAll('.خلفية-زر-اختيار').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      اختر_خلفية(خلفيات[idx]);
    });
  });
}

function اختر_خلفية(خلفية) {
  /* تطبيق الخلفية المختارة على التطبيق */
  document.body.style.backgroundImage = `url('${خلفية.صورة}')`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';

  // حفظ الخيار
  localStorage.setItem('خلفية_مختارة_url', خلفية.صورة);
  localStorage.setItem('خلفية_مختارة_ألوان', JSON.stringify(خلفية.ألوان));

  // إشعار بصري
  const إخطار = document.createElement('div');
  إخطار.className = 'خلفية-إخطار';
  إخطار.textContent = `تم تطبيق الخلفية: ${خلفية.اسم}`;
  إخطار.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    padding: 12px 20px;
    background: ${خلفية.ألوان.ابتدائي};
    color: ${خلفية.ألوان.نص_رئيسي};
    border-radius: 8px;
    z-index: 10000;
    animation: انزلاق-دخول 0.3s ease-out;
  `;
  document.body.append(إخطار);
  setTimeout(() => إخطار.remove(), 3000);
}

function استرجع_خلفية_المحفوظة() {
  /* استرجاع الخلفية المحفوظة عند التحميل */
  const url = localStorage.getItem('خلفية_مختارة_url');
  if (url) {
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  }
}

// تشغيل عند التحميل
document.addEventListener('DOMContentLoaded', استرجع_خلفية_المحفوظة);

window.خلفيات_واجهة = { أظهر_قسم_الخلفيات, اختر_خلفية, استرجع_خلفية_المحفوظة };
