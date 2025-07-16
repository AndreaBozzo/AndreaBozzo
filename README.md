# 👋 Andrea Bozzo

<p align="center">
  <img src="assets/tech_banner.png" alt="Tech stack banner" width="700"/>
</p>

<p align="center">
  <strong>Data Specialist | Pipeline Builder | Open Data Enthusiast</strong><br>
  Costruisco pipeline dati leggibili, validate e auditabili. Modello e visualizzo dataset pubblici o simulati in ambienti locali, senza vendor lock-in.
</p>

<p align="center">
  <a href="#-stack-tecnico">Stack</a> •
  <a href="#-progetti-pubblici">Progetti</a> •
  <a href="#-filosofia">Filosofia</a> •
  <a href="#-contatti">Contatti</a>
</p>

---

## 🛠️ Stack Tecnico

<details>
<summary><b>🔹 Model & Orchestrate</b></summary>

- **dbt-core** con ecosystem completo (`dbt-utils`, `dbt-expectations`, `dbt-date`)
- **DuckDB** • SQL avanzato (CTE, window functions, macro, ref/source)
- Architettura a layer: `staging → core → marts`
- Macro Jinja2, controlli incrociati, audit semiautomatico
</details>

<details>
<summary><b>🔹 Scripting & Validazione</b></summary>

- **Python 3.11+** • `pandas`, `numpy`, `pyarrow`
- Sistema di flagging anomalie e validazioni numeriche
- Notebook tecnici con **Jupyter** • Conversioni `CSV ↔ Parquet ↔ Excel`
- Sanity check automatizzati e reportistica errori
</details>

<details>
<summary><b>🔹 Visualizzazione Dati</b></summary>

- **Power BI** per report business-ready e dashboard executive
- **Excel** per analisi avanzate con formule dinamiche
- **Streamlit** per mockup rapidi e dashboard interattive
- **Plotly** / **Matplotlib** per visualizzazioni custom in Python
</details>

<details>
<summary><b>🔹 Automation & DevOps</b></summary>

- **Poetry** per dependency management • **Makefile** per automazione
- **Git** con branching strategy e commit atomici
- Configurazioni `pyproject.toml`, `YAML`
- Sviluppo **100% locale** (no cloud dependencies, no vendor lock-in)
</details>

<details>
<summary><b>🔹 Storage & Interoperabilità</b></summary>

- Formati supportati: `CSV`, `Parquet`, `Excel`, `JSON`
- Parsing dati pubblici (ISTAT, XBRL, open data governativi)
- Pipeline `raw → bronze → silver → gold` con naming consistente
- Versionamento e tracciabilità completa
</details>

---

## 🚀 Progetti Pubblici

### 🔭 [Osservatorio](https://github.com/AndreaBozzo/Osservatorio) <sup>NEW</sup>
> **Analisi dati pubblici e creazione di insight automatizzati**
> 
> - Pipeline ETL per dati ISTAT e fonti governative
> - Dashboard interattive con metriche socio-economiche
> - Sistema di alerting per variazioni significative
> - Documentazione automatica dei dataset processati

### 🧊 [Mini-Lakehouse-Didattico](https://github.com/AndreaBozzo/Mini-Lakehouse-Didattico)
> **Pipeline dati minimale con architettura lakehouse**
> 
> - Stack: `dbt` + `DuckDB` + `Python`
> - Modellazione multilevel con validazioni automatiche
> - Audit log completo e test di qualità integrati
> - Template riutilizzabile per progetti data engineering

### 📊 [CruscottoPMI](https://github.com/AndreaBozzo/CruscottoPMI)
> **Dashboard Python per analisi finanziaria PMI**
> 
> - Framework: `Streamlit` con backend `pandas`
> - KPI finanziari, filtri dinamici, export multi-formato
> - Integrazione con standard XBRL per bilanci
> - Dataset simulati per demo e formazione

### 📈 [DashboardsBI-Excel](https://github.com/AndreaBozzo/DashboardsBI-Excel)
> **Template Excel avanzati per Business Intelligence**
> 
> - Dashboard dinamiche con `Power Query` e `VBA`
> - Calcoli di bilancio e analisi what-if
> - Grafici automatizzati e report parametrici
> - Struttura scalabile per diversi settori

---

## 🧭 Filosofia di Lavoro

```
📌 Prima leggibile, poi complesso
   └─ Il codice deve essere comprensibile al primo sguardo

🧪 Qualità integrata nel processo
   └─ Test e validazioni sono parte del flusso, non aggiunte dopo

🔍 Tracciabilità end-to-end
   └─ Ogni trasformazione deve essere auditabile e reversibile

🧱 Build locale, pensa globale
   └─ Nessun lock-in, massima portabilità e riproducibilità
```

---

## 📊 Statistiche GitHub

<p align="center">
  <img src="https://github-readme-stats.vercel.app/api?username=AndreaBozzo&show_icons=true&theme=default" alt="GitHub Stats" />
</p>

---

## 📫 Contatti

<p align="center">
  <a href="mailto:andreabozzo92@gmail.com">
    <img src="https://img.shields.io/badge/Email-andreabozzo92@gmail.com-blue?style=for-the-badge&logo=gmail" alt="Email" />
  </a>
  <a href="https://github.com/AndreaBozzo">
    <img src="https://img.shields.io/badge/GitHub-AndreaBozzo-black?style=for-the-badge&logo=github" alt="GitHub" />
  </a>
  <a href="https://linkedin.com/in/andrea-bozzo">
    <img src="https://img.shields.io/badge/LinkedIn-Andrea_Bozzo-0077B5?style=for-the-badge&logo=linkedin" alt="LinkedIn" />
  </a>
</p>

---

<p align="center">
  <sub>README costruito con attenzione al dettaglio. Niente template generici, solo contenuto verificato e testato sul campo.</sub>
</p>
