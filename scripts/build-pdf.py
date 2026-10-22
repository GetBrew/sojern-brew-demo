from pathlib import Path
import re, html, textwrap
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted, Table, TableStyle, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
root=Path(__file__).resolve().parent.parent
(root/'public').mkdir(exist_ok=True)
fonts=Path('/usr/share/fonts/truetype/dejavu')
for name,file in [('Body','DejaVuSans.ttf'),('BodyBold','DejaVuSans-Bold.ttf'),('Mono','DejaVuSansMono.ttf')]:pdfmetrics.registerFont(TTFont(name,str(fonts/file)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='BodyBold',italic='Body',boldItalic='BodyBold')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='Copy',fontName='Body',fontSize=9,leading=14,textColor=colors.HexColor('#243d50'),spaceAfter=8))
styles.add(ParagraphStyle(name='Title2',fontName='BodyBold',fontSize=23,leading=29,textColor=colors.HexColor('#173044'),spaceAfter=15))
styles.add(ParagraphStyle(name='H2x',fontName='BodyBold',fontSize=15,leading=20,textColor=colors.HexColor('#173044'),spaceBefore=15,spaceAfter=8,keepWithNext=True))
styles.add(ParagraphStyle(name='H3x',fontName='BodyBold',fontSize=11,leading=16,textColor=colors.HexColor('#173044'),spaceBefore=11,spaceAfter=6,keepWithNext=True))
styles.add(ParagraphStyle(name='Code2',fontName='Mono',fontSize=7,leading=10,backColor=colors.HexColor('#f0f4f7'),borderPadding=8,spaceBefore=5,spaceAfter=12))
styles.add(ParagraphStyle(name='Cell',fontName='Body',fontSize=7.4,leading=11,textColor=colors.HexColor('#243d50')))
styles.add(ParagraphStyle(name='Bullet2',parent=styles['Copy'],leftIndent=12,firstLineIndent=-8))
def fmt(s):
 s=html.escape(s)
 s=re.sub(r'`([^`]+)`',lambda m:'<font name="Mono" size="8">'+m.group(1)+'</font>',s)
 s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
 s=re.sub(r'\[([^]]+)\]\((https?://[^)]+)\)',r'<link href="\2" color="#226f89">\1</link>',s)
 s=re.sub(r'(?<!["=])(https?://[^\s<>]+)',lambda m:m.group(1) if len(m.group(1))<90 else m.group(1),s)
 return s
lines=(root/'web/implementation-guide.md').read_text().splitlines();story=[];i=0
while i<len(lines):
 line=lines[i]
 if not line.strip():i+=1;continue
 if line.startswith('```'):
  code=[];i+=1
  while i<len(lines) and not lines[i].startswith('```'):
   code.extend(textwrap.wrap(lines[i],width=94,replace_whitespace=False,drop_whitespace=False) or ['']);i+=1
  story.append(Preformatted('\n'.join(code),styles['Code2']));i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].startswith('|'):
   cells=[c.strip() for c in lines[i].strip('|').split('|')]
   if not all(re.fullmatch(r'[:\- ]+',c) for c in cells):rows.append([Paragraph(fmt(c),styles['Cell']) for c in cells])
   i+=1
  n=len(rows[0]);widths=[110,195,190] if n==3 else [130,365]
  table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e5edf2')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#b7c8d4')),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#e0e7ed')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
  story.extend([table,Spacer(1,10)]);continue
 if line.startswith('# '):story.append(Paragraph(fmt(line[2:]),styles['Title2']));i+=1;continue
 if line.startswith('## '):story.append(Paragraph(fmt(line[3:]),styles['H2x']));i+=1;continue
 if line.startswith('#### '):story.append(Paragraph(fmt(line[5:]),styles['H3x']));i+=1;continue
 if line.startswith('### '):story.append(Paragraph(fmt(line[4:]),styles['H3x']));i+=1;continue
 if line.startswith('- ') or re.match(r'^\d+\. ',line):
  story.append(Paragraph(fmt('• '+re.sub(r'^(?:- |\d+\. )','',line)),styles['Bullet2']));i+=1;continue
 parts=[line[2:] if line.startswith('> ') else line];i+=1
 while i<len(lines) and lines[i].strip() and not re.match(r'^(#|```|\||- |\d+\. |>)',lines[i]):parts.append(lines[i]);i+=1
 story.append(Paragraph(fmt(' '.join(parts)),styles['Copy']))
def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#dce5eb'));canvas.line(50,42,545,42)
 canvas.setFont('Body',7);canvas.setFillColor(colors.HexColor('#607d8b'));canvas.drawString(50,29,'SOJERN × BREW  ·  Technical implementation brief');canvas.drawRightString(545,29,str(doc.page))
doc=SimpleDocTemplate(str(root/'public/sojern-implementation-guide.pdf'),pagesize=(595.28,841.89),rightMargin=50,leftMargin=50,topMargin=46,bottomMargin=56,title='Sojern × Brew — Technical implementation guide',author='Brew',allowSplitting=True)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
import hashlib, json
manifest = {'markdownSha256': hashlib.sha256((root/'web/implementation-guide.md').read_bytes()).hexdigest(), 'pdfSha256': hashlib.sha256((root/'public/sojern-implementation-guide.pdf').read_bytes()).hexdigest()}
(root/'web/guide-handout.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Created guide PDF and matching content manifest.')
