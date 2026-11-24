package mail

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"mime"
	"net/smtp"
	"os"
	"strings"
)

// Result describes a successful SMTP delivery.
type Result struct {
	Relay string `json:"relay"`
	From  string `json:"from"`
}

// MailpitURL is the local inbox UI used in development.
func MailpitURL() string {
	if u := strings.TrimSpace(os.Getenv("MAILPIT_WEB_URL")); u != "" {
		return u
	}
	return "http://localhost:8025"
}

// PublicAppURL is the login / dashboard base URL put into outbound email.
func PublicAppURL() string {
	if u := strings.TrimSpace(os.Getenv("APP_PUBLIC_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "http://localhost:3100"
}

func fromAddress() string {
	if from := strings.TrimSpace(os.Getenv("SMTP_FROM")); from != "" {
		return from
	}
	return "Whoopit <noreply@whoopit.local>"
}

func smtpCandidates() []string {
	seen := map[string]bool{}
	out := make([]string, 0, 4)
	add := func(addr string) {
		addr = strings.TrimSpace(addr)
		if addr == "" || seen[addr] {
			return
		}
		seen[addr] = true
		out = append(out, addr)
	}
	add(os.Getenv("SMTP_ADDR"))
	add("mailpit:1025")
	add("localhost:1025")
	add("127.0.0.1:1025")
	return out
}

func envelopeFrom(fromHeader string) string {
	fromHeader = strings.TrimSpace(fromHeader)
	if i := strings.Index(fromHeader, "<"); i >= 0 {
		j := strings.Index(fromHeader[i:], ">")
		if j > 1 {
			return strings.TrimSpace(fromHeader[i+1 : i+j])
		}
	}
	return fromHeader
}

// Send delivers a simple HTML + plain-text email. Returns an error if every SMTP candidate fails.
func Send(to, subject, htmlBody, textBody string) (*Result, error) {
	to = strings.TrimSpace(to)
	if to == "" || !strings.Contains(to, "@") {
		return nil, fmt.Errorf("valid recipient email is required")
	}
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return nil, fmt.Errorf("subject is required")
	}
	if strings.TrimSpace(textBody) == "" {
		textBody = stripTags(htmlBody)
	}

	fromHeader := fromAddress()
	fromEnv := envelopeFrom(fromHeader)
	boundary := "WhoopitMailBoundary"

	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: %s\r\n", fromHeader))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", encodeSubject(subject)))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", boundary))

	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n\r\n")
	msg.WriteString(textBody + "\r\n\r\n")

	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n\r\n")
	msg.WriteString(htmlBody + "\r\n\r\n")
	msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))

	return deliver(fromEnv, []string{to}, msg.Bytes())
}

// Attachment is an optional file attached to an email.
type Attachment struct {
	Filename string
	MimeType string
	Data     []byte
}

// SendWithAttachment delivers HTML mail with one binary/text attachment.
func SendWithAttachment(to, subject, htmlBody string, att Attachment) (*Result, error) {
	to = strings.TrimSpace(to)
	if to == "" || !strings.Contains(to, "@") {
		return nil, fmt.Errorf("valid recipient email is required")
	}
	if strings.TrimSpace(att.Filename) == "" {
		return nil, fmt.Errorf("attachment filename is required")
	}
	if att.MimeType == "" {
		att.MimeType = "application/octet-stream"
	}

	fromHeader := fromAddress()
	fromEnv := envelopeFrom(fromHeader)
	boundary := "WhoopitMailAttachBoundary"

	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: %s\r\n", fromHeader))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", encodeSubject(subject)))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n", boundary))

	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n\r\n")
	msg.WriteString(htmlBody + "\r\n\r\n")

	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString(fmt.Sprintf("Content-Type: %s; name=\"%s\"\r\n", att.MimeType, att.Filename))
	msg.WriteString("Content-Transfer-Encoding: base64\r\n")
	msg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n\r\n", att.Filename))
	msg.WriteString(base64.StdEncoding.EncodeToString(att.Data) + "\r\n")
	msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))

	return deliver(fromEnv, []string{to}, msg.Bytes())
}

func deliver(from string, to []string, raw []byte) (*Result, error) {
	var lastErr error
	for _, addr := range smtpCandidates() {
		if err := smtp.SendMail(addr, nil, from, to, raw); err != nil {
			lastErr = err
			continue
		}
		return &Result{Relay: addr, From: from}, nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no SMTP relay configured")
	}
	return nil, fmt.Errorf("smtp delivery failed: %w", lastErr)
}

func encodeSubject(subject string) string {
	return mime.QEncoding.Encode("UTF-8", subject)
}

func stripTags(html string) string {
	var b strings.Builder
	inTag := false
	for _, r := range html {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}
