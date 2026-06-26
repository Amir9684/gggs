import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { TAuthenticatedUserType } from 'src/auth/types/authenticated-request.type';

import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { GetProjectsQueryDTO } from './dto/get-projects-query.dto';

/**
 * Every route is scoped to the authenticated user: ENGINEER/REVIEWER only
 * ever see their own projects, ADMIN sees everything. The actual scoping
 * happens in `ProjectsService` (see `findOwnedOrAdmin`), not here.
 */
@Auth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.projectsService.create(createProjectDto, user);
  }

  @Get()
  getAll(
    @Query() queries: GetProjectsQueryDTO,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.projectsService.getAll(queries, user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.projectsService.getOne(id, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @CurrentUser() user: TAuthenticatedUserType,
  ) {
    return this.projectsService.update(id, updateProjectDto, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: TAuthenticatedUserType) {
    return this.projectsService.delete(id, user);
  }
}
