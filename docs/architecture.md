html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  background: #07111f;
  color: #e8eef8;
}

* {
  box-sizing: border-box;
}

button {
  cursor: pointer;
  border: none;
  border-radius: 12px;
  transition: transform 0.2s ease;
}

button:hover {
  transform: translateY(-1px);
}

.page-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}

.hero {
  background: linear-gradient(135deg, rgba(17, 24, 39, 1), rgba(15, 118, 110, 0.7));
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 28px;
  padding: 32px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.brand {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.nav-links {
  display: flex;
  gap: 24px;
}

.nav-links a {
  color: #dbe7f8;
  text-decoration: none;
  opacity: 0.8;
}

.hero-content {
  display: grid;
  grid-template-columns: 1.5fr 0.9fr;
  gap: 48px;
  padding-top: 54px;
  align-items: center;
}

.eyebrow {
  display: inline-block;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  color: #7dd3fc;
  margin-bottom: 14px;
}

h1 {
  margin: 0;
  font-size: clamp(2.5rem, 5vw, 4rem);
  line-height: 1.1;
}

.hero-content p {
  color: #dfeaf7;
  font-size: 1.1rem;
  line-height: 1.7;
  max-width: 720px;
}

.cta-row {
  display: flex;
  gap: 18px;
  margin-top: 28px;
}

.primary-button {
  background: linear-gradient(135deg, #38bdf8, #14b8a6);
  color: #04111b;
  padding: 14px 22px;
  font-weight: 700;
}

.secondary-button {
  background: rgba(15, 23, 42, 0.75);
  color: #e8eef8;
  border: 1px solid rgba(148, 163, 184, 0.4);
  padding: 14px 22px;
  font-weight: 600;
}

.stats-card {
  background: rgba(15, 23, 42, 0.8);
  padding: 24px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.stat-row:last-child {
  border-bottom: none;
}

.highlight {
  color: #a7f3d0;
}

.feature-grid,
.listing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-top: 30px;
}

.feature-card,
.listing-card,
.money-card {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 22px;
  padding: 24px;
}

.feature-tag {
  display: inline-block;
  color: #7dd3fc;
  font-weight: 700;
  margin-bottom: 10px;
}

.catalog-section,
.money-section {
  margin-top: 48px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.section-header h2,
.money-card h2 {
  margin: 0;
  font-size: clamp(1.8rem, 2vw, 2.5rem);
}

.listing-card h3 {
  margin: 18px 0 12px;
  font-size: 1.3rem;
}

.listing-card p,
.feature-card p,
.money-card li {
  color: #dfeaf7;
  line-height: 1.7;
}

.listing-top,
.tag-row,
.listing-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.listing-badge,
.quality-score,
.tag {
  background: rgba(56, 189, 248, 0.12);
  color: #7dd3fc;
  border: 1px solid rgba(125, 211, 252, 0.25);
  padding: 6px 10px;
  border-radius: 100px;
  font-size: 0.75rem;
}

.tag-row {
  margin: 18px 0;
}

.listing-footer {
  margin-top: 16px;
  align-items: flex-end;
}

.listing-footer small {
  display: block;
  color: #94a3b8;
  margin-bottom: 4px;
}

.price-block {
  text-align: right;
}

.money-card ul {
  margin: 20px 0 0;
  padding-left: 18px;
}

@media (max-width: 900px) {
  .hero-content,
  .feature-grid,
  .listing-grid {
    grid-template-columns: 1fr;
  }

  .topbar,
  .section-header,
  .cta-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .nav-links {
    flex-wrap: wrap;
  }
}
