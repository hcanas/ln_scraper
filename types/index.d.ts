export interface Publication {
    title: string,
    synopsis: string,
    creators: (string | null)[],
    genres: (string | null)[],
    type: string,
}

export interface Book {
    title: string,
    volume_start: number | null,
    volume_end: number | null,
    cover_image: string | null,
    release_date: string,
    isbn: number,
    type: string,
}