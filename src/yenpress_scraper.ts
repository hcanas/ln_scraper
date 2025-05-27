import { chromium, Page } from 'playwright';
import { Publication, Book } from '../types';
import fs from 'fs';

const start_url = 'https://yenpress.com/category/light-novels/all/series';

const all_publications = <Publication[]>[];

const all_books = <Book[]>[];

async function scrapePublication(url: string, page: Page): Promise<Publication> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    const { publication, books }: { publication: Publication, books: Book[] } = await page.evaluate(async () => {
        // publication title
        const title = document.querySelector('div.heading-content h1')?.textContent ?? '';

        // publication synopsis
        const synopsis = document.querySelector('div.content-heading-txt p.paragraph')?.textContent ?? '';

        // publication creators
        const creators = Array.from(document.querySelectorAll('div.story-details p.paragraph span'))
            .map(el => el.textContent);

        // publication genres
        const genres = Array.from(document.querySelectorAll('div#series-meta a[rel="tag"]'))
            .map(el => el.textContent);

        // publication type
        const temp_books = Array.from(document.querySelectorAll('a.series-volume')).filter(el => el.textContent?.match(/Light Novel/));
        const publication_type = (temp_books.length > 1 || temp_books[0]?.textContent?.match(/(Vol\.|Novel) (\d+)/))
            ? 'series' 
            : 'standalone';

        // get urls of volumes
        const books = Array.from(document.querySelectorAll('a.series-volume'))
            .filter(el => el.textContent?.match(/Light Novel/))
            .map(el => {
                // book info block
                const full_text = el.textContent ?? '';

                let matches: RegExpMatchArray | null = null;

                // book cover image
                const img_src = el.querySelector('img')?.getAttribute('src') ?? '';
                const cover_image = img_src.includes('nocover') 
                    ? null
                    : img_src;

                let volume_start = null;
                let volume_end = null;
                let book_type = '';

                if (publication_type === 'standalone') {
                    book_type = 'single';
                } else {
                    if (matches = full_text.match(/(?<!Omnibus) (?:Vol\.|Novel) (\d+)/)) {
                        volume_start = parseInt(matches[1]);
                        book_type = 'volume';
                    } else if (matches = full_text.match(/(?<=Omnibus) (?:Vol\.|Novel) (\d+)-(\d+)/)) {
                        volume_start = parseInt(matches[1]);
                        volume_end = parseInt(matches[2]);
                        book_type = 'omnibus';
                    } else {
                        // some publications have no numbering on their first volume
                        // it will be treated as vol 1 by default
                        volume_start = 1;
                        book_type = 'volume';
                    }
                }

                // book release date
                matches = full_text.match(/(?:Release Date: )([A-Za-z]+)\s(\d{1,2}),\s(\d{4})/i);
                const release_date = matches ? matches[0].replace('Release Date: ', '') : '';

                // book isbn
                matches = full_text.replace(/-/g, '').match(/\d{10,13}/);
                const isbn = matches ? parseInt(matches[0]) : 0;

                return {
                    title,
                    volume_start,
                    volume_end,
                    cover_image,
                    release_date,
                    isbn,
                    type: book_type,
                };
            });

        return {
            publication: {
                title,
                synopsis,
                creators,
                genres,
                type: publication_type,
            }, 
            books,
        };
    });

    all_books.push(...books);

    return publication;
}

function generateCsvFile(): void {
    let header = 'title|synopsis|creators|genres|type\n';
    let content = all_publications.map(publication => {
        return Object.values(publication).map(item => Array.isArray(item) ? JSON.stringify(item) : item).join('|');
    }).join('\n');

    fs.writeFileSync('../data/sevenseas_publications.csv', header.concat(content), 'utf8');

    header = 'title|volume_start|volume_end|cover_image|release_date|isbn|type\n';
    content = all_books.map(book => Object.values(book).join('|')).join('\n');

    fs.writeFileSync('../data/sevenseas_books.csv', header.concat(content), 'utf8');
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(start_url, { waitUntil: 'domcontentloaded' });

    let prevScrollHeight = 0;
    let currScrollHeight = 1;

    // use for loop to stop a possible infinite loop using while
    while (currScrollHeight !== prevScrollHeight) {
        prevScrollHeight = currScrollHeight;
        page.mouse.wheel(0, 15000);

        await new Promise(r => setTimeout(r, 2000));

        currScrollHeight = await page.evaluate(() => document.body.scrollHeight ?? 0);
    }

    const urls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div.inline_block a'))
            .map(el => el.getAttribute('href') || '');
    });

    for (const url of urls) {
        const publication = await scrapePublication(url, page);
        all_publications.push(publication);
    }

    await browser.close();
    
    // generateCsvFile();
}

run();