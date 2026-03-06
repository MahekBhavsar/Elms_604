import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminLeave } from './admin-leave';

describe('AdminLeave', () => {
  let component: AdminLeave;
  let fixture: ComponentFixture<AdminLeave>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLeave]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminLeave);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
