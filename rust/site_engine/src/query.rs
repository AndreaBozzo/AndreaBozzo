use crate::models::WorkItem;

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Expr {
    Term(String),
    Field {
        field: String,
        value: String,
    },
    Compare {
        field: String,
        op: CompareOp,
        value: f32,
    },
    Not(Box<Expr>),
    And(Box<Expr>, Box<Expr>),
    Or(Box<Expr>, Box<Expr>),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum CompareOp {
    Gt,
    Lt,
    Gte,
    Lte,
    Eq,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct QueryError {
    pub(crate) offset: usize,
    pub(crate) message: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct QueryMatch {
    pub(crate) matched: bool,
    pub(crate) score: f32,
}

const TEXT_FIELDS: &[&str] = &[
    "tech", "tag", "topic", "kind", "type", "title", "summary", "text",
];
const NUMERIC_FIELDS: &[&str] = &["stars", "prs"];

pub(crate) fn parse(input: &str) -> Result<Option<Expr>, QueryError> {
    let mut parser = Parser::new(input);
    parser.skip_ws();
    if parser.is_end() {
        return Ok(None);
    }

    let expr = parser.parse_or()?;
    parser.skip_ws();
    if parser.is_end() {
        Ok(Some(expr))
    } else if parser.peek_char() == Some(')') {
        Err(parser.error("unexpected closing parenthesis"))
    } else {
        Err(parser.error("expected AND or OR"))
    }
}

pub(crate) fn looks_structured(input: &str) -> bool {
    let lower = input.to_ascii_lowercase();
    input.contains(':')
        || input.contains('(')
        || input.contains(')')
        || lower.split_whitespace().any(|part| {
            matches!(part, "and" | "or" | "not") || part.starts_with('>') || part.starts_with('<')
        })
}

pub(crate) fn evaluate(expr: &Expr, item: &WorkItem) -> QueryMatch {
    match expr {
        Expr::Term(term) => {
            let score = term_score(item, term);
            QueryMatch {
                matched: score > 0.0,
                score,
            }
        }
        Expr::Field { field, value } => {
            let matched = match_field(item, field, value);
            QueryMatch {
                matched,
                score: if matched { 3.0 } else { 0.0 },
            }
        }
        Expr::Compare { field, op, value } => {
            let actual = numeric_field(item, field);
            let matched = actual
                .map(|actual| compare(actual, *op, *value))
                .unwrap_or(false);
            QueryMatch {
                matched,
                score: if matched { 2.0 } else { 0.0 },
            }
        }
        Expr::Not(inner) => {
            let result = evaluate(inner, item);
            QueryMatch {
                matched: !result.matched,
                score: 0.0,
            }
        }
        Expr::And(left, right) => {
            let left = evaluate(left, item);
            if !left.matched {
                return QueryMatch {
                    matched: false,
                    score: 0.0,
                };
            }
            let right = evaluate(right, item);
            QueryMatch {
                matched: right.matched,
                score: if right.matched {
                    left.score + right.score
                } else {
                    0.0
                },
            }
        }
        Expr::Or(left, right) => {
            let left = evaluate(left, item);
            let right = evaluate(right, item);
            QueryMatch {
                matched: left.matched || right.matched,
                score: left.score.max(right.score),
            }
        }
    }
}

pub(crate) fn term_score(item: &WorkItem, term: &str) -> f32 {
    let term = normalize(term);
    if term.is_empty() {
        return 0.0;
    }

    let title = normalize(&item.title);
    if title.contains(&term) {
        return 4.0;
    }
    if item.tags.iter().any(|tag| normalize(tag).contains(&term)) {
        return 3.0;
    }
    if item
        .topics
        .iter()
        .any(|topic| normalize(topic).contains(&term))
    {
        return 2.0;
    }

    let haystack = normalize(&format!(
        "{} {} {} {} {}",
        item.title,
        item.label,
        item.summary,
        item.tags.join(" "),
        item.topics.join(" ")
    ));
    if haystack.contains(&term) { 1.5 } else { 0.0 }
}

fn match_field(item: &WorkItem, field: &str, value: &str) -> bool {
    let value = normalize(value);
    if value.is_empty() {
        return false;
    }

    match field {
        "tech" | "tag" => item.tags.iter().any(|tag| normalize(tag).contains(&value)),
        "topic" => item
            .topics
            .iter()
            .any(|topic| normalize(topic).contains(&value)),
        "kind" | "type" => normalize(&item.kind).contains(&value),
        "title" => normalize(&item.title).contains(&value),
        "summary" => normalize(&item.summary).contains(&value),
        "text" => term_score(item, &value) > 0.0,
        _ => false,
    }
}

fn numeric_field(item: &WorkItem, field: &str) -> Option<f32> {
    match field {
        "stars" => Some(item.stars),
        "prs" => Some(item.prs),
        _ => None,
    }
}

fn compare(actual: f32, op: CompareOp, expected: f32) -> bool {
    match op {
        CompareOp::Gt => actual > expected,
        CompareOp::Lt => actual < expected,
        CompareOp::Gte => actual >= expected,
        CompareOp::Lte => actual <= expected,
        CompareOp::Eq => (actual - expected).abs() < f32::EPSILON,
    }
}

fn normalize(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, pos: 0 }
    }

    fn parse_or(&mut self) -> Result<Expr, QueryError> {
        let mut expr = self.parse_and()?;
        loop {
            self.skip_ws();
            if !self.consume_keyword("OR") {
                break;
            }
            let right = self.parse_and()?;
            expr = Expr::Or(Box::new(expr), Box::new(right));
        }
        Ok(expr)
    }

    fn parse_and(&mut self) -> Result<Expr, QueryError> {
        let mut expr = self.parse_unary()?;
        loop {
            self.skip_ws();
            if !self.consume_keyword("AND") {
                break;
            }
            let right = self.parse_unary()?;
            expr = Expr::And(Box::new(expr), Box::new(right));
        }
        Ok(expr)
    }

    fn parse_unary(&mut self) -> Result<Expr, QueryError> {
        self.skip_ws();
        if self.consume_keyword("NOT") {
            return Ok(Expr::Not(Box::new(self.parse_unary()?)));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Expr, QueryError> {
        self.skip_ws();
        if self.is_end() {
            return Err(self.error("expected a term"));
        }

        if self.peek_char() == Some('(') {
            self.bump_char();
            let expr = self.parse_or()?;
            self.skip_ws();
            if self.peek_char() != Some(')') {
                return Err(self.error("expected closing parenthesis"));
            }
            self.bump_char();
            return Ok(expr);
        }

        self.parse_atom()
    }

    fn parse_atom(&mut self) -> Result<Expr, QueryError> {
        let offset = self.pos;
        let token = self.read_token();
        if token.is_empty() {
            return Err(self.error_at(offset, "expected a term"));
        }

        if matches!(token.to_ascii_uppercase().as_str(), "AND" | "OR") {
            return Err(self.error_at(offset, "expected a term before operator"));
        }

        if let Some((field, raw_value)) = token.split_once(':') {
            let field = normalize(field);
            if field.is_empty() {
                return Err(self.error_at(offset, "expected a field before ':'"));
            }
            if raw_value.is_empty() {
                return Err(self.error_at(offset + token.len(), "expected a value after ':'"));
            }

            if NUMERIC_FIELDS.contains(&field.as_str()) {
                let (op, number_text) = parse_comparison(raw_value);
                let value = parse_number(number_text).ok_or_else(|| {
                    self.error_at(offset + field.len() + 1, "expected a numeric value")
                })?;
                return Ok(Expr::Compare { field, op, value });
            }

            if !TEXT_FIELDS.contains(&field.as_str()) {
                return Err(self.error_at(offset, "unknown query field"));
            }

            return Ok(Expr::Field {
                field,
                value: raw_value.to_string(),
            });
        }

        Ok(Expr::Term(token))
    }

    fn read_token(&mut self) -> String {
        let start = self.pos;
        while let Some(ch) = self.peek_char() {
            if ch.is_whitespace() || ch == '(' || ch == ')' {
                break;
            }
            self.bump_char();
        }
        self.input[start..self.pos].to_string()
    }

    fn consume_keyword(&mut self, keyword: &str) -> bool {
        let saved = self.pos;
        let Some(slice) = self.input.get(self.pos..) else {
            return false;
        };
        if !slice
            .get(..keyword.len())
            .map(|head| head.eq_ignore_ascii_case(keyword))
            .unwrap_or(false)
        {
            return false;
        }
        self.pos += keyword.len();
        if self
            .peek_char()
            .map(|ch| ch.is_alphanumeric() || ch == '_' || ch == '-')
            .unwrap_or(false)
        {
            self.pos = saved;
            return false;
        }
        true
    }

    fn skip_ws(&mut self) {
        while self
            .peek_char()
            .map(|ch| ch.is_whitespace())
            .unwrap_or(false)
        {
            self.bump_char();
        }
    }

    fn peek_char(&self) -> Option<char> {
        self.input.get(self.pos..)?.chars().next()
    }

    fn bump_char(&mut self) {
        if let Some(ch) = self.peek_char() {
            self.pos += ch.len_utf8();
        }
    }

    fn is_end(&self) -> bool {
        self.pos >= self.input.len()
    }

    fn error(&self, message: &str) -> QueryError {
        self.error_at(self.pos, message)
    }

    fn error_at(&self, offset: usize, message: &str) -> QueryError {
        QueryError {
            offset,
            message: message.to_string(),
        }
    }
}

fn parse_comparison(raw: &str) -> (CompareOp, &str) {
    if let Some(rest) = raw.strip_prefix(">=") {
        (CompareOp::Gte, rest)
    } else if let Some(rest) = raw.strip_prefix("<=") {
        (CompareOp::Lte, rest)
    } else if let Some(rest) = raw.strip_prefix('>') {
        (CompareOp::Gt, rest)
    } else if let Some(rest) = raw.strip_prefix('<') {
        (CompareOp::Lt, rest)
    } else if let Some(rest) = raw.strip_prefix('=') {
        (CompareOp::Eq, rest)
    } else {
        (CompareOp::Eq, raw)
    }
}

fn parse_number(raw: &str) -> Option<f32> {
    let text = raw.trim().to_ascii_lowercase();
    let (number, multiplier) = if let Some(base) = text.strip_suffix('k') {
        (base, 1_000.0)
    } else if let Some(base) = text.strip_suffix('m') {
        (base, 1_000_000.0)
    } else {
        (text.as_str(), 1.0)
    };
    number.parse::<f32>().ok().map(|value| value * multiplier)
}
