# 🤝 Contributing Guidelines

Grazie per il tuo interesse nel contribuire ai miei progetti! Questo documento descrive come collaborare efficacemente.

## 🚀 Come Contribuire

### 1. Prima di Iniziare
- Dai un'occhiata agli [Issues aperti](https://github.com/AndreaBozzo/Osservatorio/issues)
- Leggi la documentazione del progetto
- Familiarizza con il nostro [Code of Conduct](#code-of-conduct)

### 2. Setup Locale
```bash
# Fork e clona il repository
git clone https://github.com/TUO-USERNAME/NOME-PROGETTO.git
cd NOME-PROGETTO

# Installa le dipendenze
pip install -r requirements.txt
# oppure
poetry install

# Esegui i test
pytest
```

### 3. Workflow di Sviluppo
1. **Crea un branch** per la tua feature: `git checkout -b feature/nome-feature`
2. **Sviluppa** seguendo le convenzioni del progetto
3. **Testa** le tue modifiche: `pytest` + `pre-commit run --all-files`
4. **Commita** con messaggi chiari: `git commit -m "feat: aggiungi nuova visualizzazione"`
5. **Push** e crea una **Pull Request**

## 📋 Linee Guida

### Codice
- **Python**: Segui PEP 8, usa type hints
- **SQL**: Formattazione con SQLFluff
- **dbt**: Modelli in `staging/` → `core/` → `marts/`
- **Test**: Coverage minima 70%

### Commit Messages
Usa il formato [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` nuove funzionalità
- `fix:` correzioni di bug
- `docs:` aggiornamenti documentazione
- `test:` aggiunta/modifica test
- `refactor:` refactoring codice

### Pull Request
- **Titolo descrittivo** e **template compilato**
- **Descrizione dettagliata** delle modifiche
- **Test** aggiornati e funzionanti
- **Documentazione** aggiornata se necessario

## 🎯 Aree di Contributo

### Priorità Alta
- 🔧 **Bug fixes** e ottimizzazioni performance
- 📊 **Nuove fonti dati** (ISTAT, Eurostat, etc.)
- 📈 **Dashboard** e visualizzazioni

### Priorità Media
- 📚 **Documentazione** e tutorial
- 🧪 **Test coverage** e quality assurance
- 🌐 **Internazionalizzazione**

### Idee Benvenute
- 💡 **Nuove feature** per l'ecosistema data
- 🔌 **Integrazioni** con altri tools
- 📦 **Packaging** e deployment

## 🆘 Supporto

- 💬 **Discussioni**: [GitHub Discussions](https://github.com/AndreaBozzo/Osservatorio/discussions)
- 📧 **Email**: andreabozzo92@gmail.com
- 💼 **LinkedIn**: [Andrea Bozzo](https://www.linkedin.com/in/andrea-bozzo-/)

## Code of Conduct

### Comportamenti Attesi
- Rispetto reciproco e inclusività
- Feedback costruttivo e professionale
- Focus su soluzioni collaborative

### Non Tollerati
- Linguaggio offensivo o discriminatorio
- Attacchi personali o molestie
- Spam o self-promotion eccessiva

---

**Ricorda**: Ogni contributo, per quanto piccolo, fa la differenza! 🌟

*Grazie per rendere l'ecosistema open data italiano più accessibile a tutti.*