import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { CreateGroundWireDto } from './dto/create-ground-wire.dto';
import { UpdateGroundWireDto } from './dto/update-ground-wire.dto';
import { GroundWiresService } from './ground-wires.service';

@Auth()
@Controller('ground-wires')
export class GroundWiresController {
  constructor(private readonly groundWiresService: GroundWiresService) {}

  @Post()
  create(
    @Body() dto: CreateGroundWireDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.groundWiresService.create(dto, user);
  }

  @Get()
  getAll(@CurrentUser() user: TAuthenticatedUserType) {
    return this.groundWiresService.getAll(user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroundWireDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.groundWiresService.update(id, dto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.groundWiresService.delete(id, user);
  }
}
