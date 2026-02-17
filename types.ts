
export enum Section {
  Home = 'home',
  Bio = 'bio',
  Gallery = 'gallery',
  Shop = 'shop',
  Automation = 'automation'
}

export interface Product {
  id: string;
  title: string;
  price: string;
  category: string;
  image: string;
  description: string;
}

export interface Photo {
  id: string;
  url: string;
  title: string;
  category: string;
}
