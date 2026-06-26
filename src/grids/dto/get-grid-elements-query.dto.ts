import { GridElementType } from '../enum';

export class GetGridElementsQueryDTO {
  gridId: string;
  type?: GridElementType;
}
