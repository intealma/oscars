# Restaurang Oscar

Designförslag för [oscars.nu](https://www.oscars.nu/). En sida med dagens lunch, veckans luncher, catering (lunch, övrig tid, baguetter, pajer, julbord), om oss och kontakt, plus en beställningskorg som skickar beställningen direkt till restaurangoscars@gmail.com. All text kommer ordagrant från nuvarande oscars.nu och dess PDF:er.

Det här är en demo, inte Restaurang Oscars officiella webbplats. På GitHub Pages märks sidan Demo, visas inte i sökmotorer och beställningen skickas inte. Demoläget slås bara på för github.io, så samma filer fungerar på oscars.nu.

## Visa demon lokalt

```bash
python3 dev_server.py
```

Öppna http://localhost:8086. Beställningar fungerar lokalt, skrivs ut i terminalen och sparas i `orders/orders.php`.

## Så fungerar beställningen

1. Kunden lägger till rätter direkt i menyn. Varukorgen sparas i webbläsaren.
2. Leveransdag väljs i Catering lunch eller i korgen. Lunchcatering går bara på vardagar, före 09:00 för samma dag, och kräver minst 5 personer (en paj räknas som 5).
3. Kunden fyller i namn, telefon, e-post och adress och skickar. Övrig tid och julbord skickas som förfrågan med önskad tid.
4. `send.php` räknar om priserna från `meny.json`, sparar beställningen i `orders/orders.php` och mejlar restaurangen. Svara-knappen i mejlet går till kunden.

Kunden får ett ordernummer (till exempel `OS-261028-4F2A`) på skärmen. Kontaktuppgifterna fylls i automatiskt nästa gång samma kund beställer.

## Uppdatera veckans luncher

Öppna `veckans-luncher.txt`, skriv in veckans nummer och rätter och ladda upp filen. Startsidans dagens lunch, veckomenyn och Alternativ 1-3 i lunchcateringen uppdateras av sig själva. `matsedel.pdf` kan fortfarande laddas upp som förut för den som vill skriva ut.

## Ändra priser och rätter

Allt i cateringen ligger i `meny.json`. Samma fil används av sidan och av `send.php`, så priset ändras på båda ställena samtidigt.

## Publicera på webbhotellet

1. Ladda upp alla filer utom `dev_server.py`, `README.md` och `assets/orig/`.
2. Servern behöver PHP 8 eller senare.
3. Beställningarna läses via FTP. `orders.php` börjar med `<?php exit; ?>`, så den visar en tom sida om någon öppnar den i webbläsaren, och `orders/.htaccess` stänger mappen.
4. Avsändaren `webb@oscars.nu` (överst i `send.php`) bör finnas på domänen, annars kan mejlen hamna i skräpposten hos Gmail.
5. Sajten sparar personuppgifter, så den behöver en integritetspolicy innan den går live.

## Loggan

Flamman är spårad från originalloggan (`assets/orig/oscar_logo.jpg`) till vektor i `assets/flame.svg`, så den är skarp i alla storlekar. Texten RESTAURANG OSCAR sätts i Michroma, som liknar originalets breda bokstäver.

## Typsnitt

Michroma, Barlow och Barlow Condensed ligger i `assets/fonts/` (SIL Open Font License, från Google Fonts). De laddas från sajten själv, så inga besökaruppgifter skickas till Google.

## Att kolla med Oscars

- Övrig tid: nuvarande sajt säger att bokningar bara tas emot via telefon. Texten står kvar, och sidan skickar förfrågningar som de ringer upp. Vill de ta emot bokningar direkt kan meningen strykas.
- Gäller minimum 5 personer och utkörningen ca kl 10:30-11:30 även baguetter och pajer? Demon räknar så.
- Alternativ 1-3 tolkas som dagens två rätter och veckans wok.
- Lunchtiden står som 11.00-14.00 på sidan men 11:00-14:30 i Googles beskrivning av sajten.
- Foton i högre upplösning. Nuvarande bilder är 273 px breda.
