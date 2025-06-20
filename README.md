<p align="center">
  <img src="./assets/tech_banner.png" alt="Tech stack badges banner" />
</p>
# 👋 Andrea Bozzo

Costruisco pipeline dati leggibili, validate e auditabili.  
Modello e visualizzo dataset pubblici o simulati in ambienti locali, senza vendor lock-in.  
Uso dbt, DuckDB, Python e strumenti di visualizzazione per produrre output tracciabili e analizzabili.

---

## 🛠️ Stack tecnico reale (usato, testato, stressato)

🔹 **Model & Orchestrate**
- `dbt-core` (con `dbt-utils`, `dbt-expectations`, `dbt-date`)
- DuckDB • SQL avanzato (CTE, window, macro, ref/source)
- Layering chiaro: staging → core → marts
- Macro Jinja2, controlli incrociati, audit semiautomatico

🔹 **Scripting & Validazione**
- Python 3.11 • `pandas`, `numpy`, `pyarrow`
- Flagging anomalie, validazioni numeriche, sanity check
- Notebook tecnici con Jupyter • CSV ↔ Parquet ↔ Excel

🔹 **Visualizzazione dati**
- Power BI per report business-ready
- Excel per dashboard con calcoli avanzati
- Streamlit per mockup e dashboard interattive in Python
- Plotly / Matplotlib se serve codice più fine

🔹 **Automation & Dev tools**
- Poetry • Makefile • Git (repo modulari, commit netti)
- Bash minimale, `pyproject.toml`, YAML
- Sviluppo full-local (no cloud, no vendor lock-in)

🔹 **Storage & interoperabilità**
- Formati: CSV, Parquet, Excel
- Parsing dati pubblici (es. open data ISTAT, esplorazioni su XBRL)
- Gestione raw → clean con naming e tracciabilità

🔹 **Testing & Audit**
- Test dbt: not_null, unique, expectations, row count
- Logging anomalie, audit trail su modelli core/marts
- Workflow: esecuzioni in locale → esportazione → analisi

---

## 🧪 Progetti pubblici principali

### 🧊 [Mini-Lakehouse-Didattico](https://github.com/AndreaBozzo/Mini-Lakehouse-Didattico)
> Pipeline dati minimale in dbt + DuckDB.  
> Modellazione multilevel, validazioni automatiche, audit log.

### 📊 [CruscottoPMI](https://github.com/AndreaBozzo/CruscottoPMI)
> Dashboard Python-based con Streamlit su dati finanziari simulati.  
> KPI, filtri dinamici, esportazione e test di integrazione XBRL.

### 📈 [DashboardBI-Excel](https://github.com/AndreaBozzo/DashboardBI-Excel)
> Dashboard Excel dinamiche e simulate per scenari aziendali.  
> Calcoli di bilancio, grafici automatizzati, struttura scalabile.

---

## 🧭 Filosofia di lavoro

- 📌 **Prima leggibile, poi complesso**
- 🧪 **Controllo qualità e validazione integrati nel flusso**
- 🔍 **Tracciabilità dei dati e chiarezza nei modelli**
- 🧱 **Build locale, strutturato, modificabile**

---

## 📫 Contatti

📧 [andreabozzo92@gmail.com](mailto:andreabozzo92@gmail.com)  
🔗 [GitHub](https://github.com/AndreaBozzo)

---

<sub>README auto-generato e auto-mantenuto con attenzione al reale. Niente template, solo contenuto verificato.</sub>

